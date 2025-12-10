import Bottleneck from 'bottleneck';
import { eq } from 'drizzle-orm';
import { db, testConnection } from '@/db/index.js';
import { workerControl } from '@/db/schema.js';
import { routePayload } from './router.js';
import { deleteMessage, receiveMessages, testAwsConnection } from './sqsClient.js';

console.log('[Worker] Starting Amazon Marketing Stream worker...');

// Graceful shutdown flag
let shuttingDown = false;

/**
 * Parse AMS payload from SQS message body
 *
 * Amazon Marketing Stream delivers messages directly to SQS with Raw Message Delivery enabled,
 * so messages are NOT wrapped in SNS envelopes. The message body contains the AMS payload directly.
 */
function parseAmsPayload(body: string | undefined): unknown {
    if (!body) {
        throw new Error('Message body is empty');
    }

    try {
        const payload = JSON.parse(body);

        // Verify this looks like an AMS payload (should have datasetId)
        if (!payload || typeof payload !== 'object') {
            throw new Error('Message body is not a valid JSON object');
        }

        return payload;
    } catch (error) {
        // Log the actual body for debugging
        const bodyPreview = body.length > 500 ? `${body.substring(0, 500)}...` : body;
        console.error(`[Worker] Failed to parse message body. Preview: ${bodyPreview}`);
        throw new Error(
            `Failed to parse AMS payload: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/**
 * Process a single SQS message
 */
async function processMessage(message: {
    Body?: string;
    ReceiptHandle?: string;
    MessageId?: string;
}): Promise<void> {
    if (!message.ReceiptHandle) {
        throw new Error('Message missing ReceiptHandle');
    }

    const messageId = message.MessageId || 'unknown';

    try {
        // Parse AMS payload directly (AMS uses Raw Message Delivery, no SNS envelope)
        const payload = parseAmsPayload(message.Body);

        // Extract datasetId for logging (AMS uses snake_case: dataset_id)
        const datasetId =
            typeof payload === 'object' && payload !== null && 'dataset_id' in payload
                ? String(payload.dataset_id)
                : 'unknown';

        console.log(`[Worker] Processing message ${messageId} (dataset: ${datasetId})`);

        // Route to appropriate handler
        await routePayload(payload);

        // Success - delete message from queue
        await deleteMessage(message.ReceiptHandle);
        console.log(`[Worker] ✓ Successfully processed message ${messageId}`);
    } catch (error) {
        // Log error but don't delete message - SQS will retry
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Worker] ✗ Failed to process message ${messageId}: ${errorMessage}`);
        if (error instanceof Error && error.stack) {
            console.error(`[Worker] Stack trace:`, error.stack);
        }
        // Don't delete - let SQS handle retries and DLQ routing
        throw error;
    }
}

/**
 * Get worker configuration from the database
 */
async function getWorkerConfig(): Promise<{ enabled: boolean; messagesPerSecond: number }> {
    try {
        const control = await db
            .select()
            .from(workerControl)
            .where(eq(workerControl.id, 'main'))
            .limit(1);

        // If no row exists, default to enabled with unlimited speed (backward compatibility)
        if (control.length === 0) {
            // Initialize the row with enabled = true and messagesPerSecond = 0 (unlimited)
            try {
                await db
                    .insert(workerControl)
                    .values({ id: 'main', enabled: true, messagesPerSecond: 0 });
            } catch {
                // Row might have been created by another process, ignore
            }
            return { enabled: true, messagesPerSecond: 0 };
        }

        return {
            enabled: control[0].enabled,
            messagesPerSecond: control[0].messagesPerSecond ?? 0,
        };
    } catch (error) {
        // On error, default to enabled with unlimited speed to avoid breaking existing behavior
        console.error('[Worker] Error checking worker control state:', error);
        return { enabled: true, messagesPerSecond: 0 };
    }
}

/**
 * Main worker loop
 */
async function runWorker(): Promise<void> {
    let limiter: Bottleneck | null = null;

    while (!shuttingDown) {
        try {
            // Get worker configuration
            const config = await getWorkerConfig();
            if (!config.enabled) {
                console.log(
                    '[Worker] Queue processing is disabled. Waiting 5 seconds before checking again...'
                );
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }

            // Update rate limiter if config changed
            if (config.messagesPerSecond > 0) {
                // Create bottleneck limiter: minTime = milliseconds between messages
                // messagesPerSecond = 10 means minTime = 100ms (1000ms / 10)
                const minTime = 1000 / config.messagesPerSecond;
                limiter = new Bottleneck({
                    minTime, // Minimum time between jobs in milliseconds
                    maxConcurrent: 1, // Process one message at a time
                });
            } else {
                limiter = null; // Unlimited
            }

            // Always use 10 second long polling
            const waitTimeSeconds = 10;
            console.log(`[Worker] Polling SQS queue (waitTimeSeconds: ${waitTimeSeconds})...`);
            const messages = await receiveMessages(waitTimeSeconds);

            // If shutting down, exit immediately without processing
            if (shuttingDown) {
                break;
            }

            if (messages.length === 0) {
                // No messages - wait 60 seconds before polling again
                console.log(
                    '[Worker] No messages received. Waiting 60 seconds before next poll...'
                );
                await new Promise(resolve => setTimeout(resolve, 60000));
                continue;
            }

            console.log(`[Worker] Received ${messages.length} message(s) in batch`);

            // Process all messages in the batch with rate limiting
            const processPromises = messages.map(message => {
                if (shuttingDown) {
                    return Promise.resolve();
                }

                // Use bottleneck to schedule the job if rate limiting is enabled
                if (limiter) {
                    return limiter
                        .schedule(() => processMessage(message))
                        .catch(() => {
                            // Error already logged in processMessage
                        });
                } else {
                    // No rate limiting - process immediately
                    return processMessage(message).catch(() => {
                        // Error already logged in processMessage
                    });
                }
            });

            // Wait for all messages in the batch to be processed
            await Promise.all(processPromises);
            console.log(`[Worker] Completed processing batch of ${messages.length} message(s)`);
        } catch (error) {
            // If shutting down, exit on error
            if (shuttingDown) {
                break;
            }

            const errorMessage = error instanceof Error ? error.message : String(error);

            // Log polling errors but continue (credentials should have been checked at startup)
            console.error('[Worker] Error during polling:', errorMessage);
            // Wait a bit before retrying to avoid tight error loops
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.log('[Worker] Worker loop exited');
}

/**
 * Graceful shutdown handler
 *
 * Canonical SQS pattern:
 * 1. Set flag to stop polling for new messages
 * 2. Let current batch finish processing (or timeout and be redelivered)
 * 3. Exit cleanly
 *
 * The visibility timeout (30s) ensures messages we don't finish processing
 * will become visible again and be redelivered to another worker instance.
 */
function shutdown(signal: string): void {
    console.log(`[Worker] Received ${signal}, shutting down gracefully...`);
    console.log('[Worker] Stopping message polling. Current batch will finish processing.');
    shuttingDown = true;

    // Don't call process.exit() here - let the worker loop exit naturally
    // The main async function will handle cleanup and exit
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Worker] Unhandled rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', error => {
    console.error('[Worker] Uncaught exception:', error);
    process.exit(1);
});

// Start the worker
(async () => {
    try {
        // Test database connection
        await testConnection();
        console.log('[Worker] Database connection verified');

        // Test AWS credentials and queue access
        let awsReady = false;
        try {
            await testAwsConnection();
            console.log('[Worker] AWS credentials verified');
            awsReady = true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('');
            console.error('═══════════════════════════════════════════════════════════════');
            console.error(`[${new Date().toISOString()}] BidBeacon Worker - AWS Credentials Error`);
            console.error('═══════════════════════════════════════════════════════════════');
            console.error('✗ AWS credentials not available');
            console.error(`  Error: ${errorMessage}`);
            console.error('');
            console.error('Worker will not start SQS polling until credentials are configured.');
            console.error('Container will remain running for log visibility.');
            console.error('');
            console.error('To fix:');
            console.error('  1. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars, or');
            console.error('  2. Configure IAM role with SQS permissions, or');
            console.error('  3. Mount ~/.aws/credentials file');
            console.error('═══════════════════════════════════════════════════════════════');
            console.error('');
        }

        if (!awsReady) {
            // Keep container alive but don't start polling
            console.log('[Worker] Waiting for AWS credentials to be configured...');
            // Wait indefinitely (container stays up, logs visible)
            await new Promise(() => {
                // Never resolves - keeps container alive
            });
        }

        // Print startup status summary
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`[${new Date().toISOString()}] BidBeacon Worker Ready`);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`✓ Database connected`);
        console.log(`✓ AWS credentials verified`);
        console.log(`✓ Queue: ${process.env.AMS_QUEUE_URL}`);
        console.log(`✓ Region: ${process.env.AWS_REGION || 'us-east-1'}`);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('');

        // Start the main loop
        await runWorker();

        // Worker loop exited cleanly
        console.log('[Worker] Shutdown complete');
        process.exit(0);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[Worker] Fatal startup error:', errorMessage);
        if (error instanceof Error && error.stack) {
            console.error('[Worker] Stack trace:', error.stack);
        }
        process.exit(1);
    }
})();
