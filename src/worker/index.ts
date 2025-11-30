import { eq } from 'drizzle-orm';
import { db, testConnection } from '@/db/index.js';
import { worker_control } from '@/db/schema.js';
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
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`[Worker] Processing message: ${messageId}`);
        console.log('═══════════════════════════════════════════════════════════════');

        // Log full message body
        if (message.Body) {
            console.log('[Worker] Raw message body:');
            try {
                const parsed = JSON.parse(message.Body);
                console.log(JSON.stringify(parsed, null, 2));
            } catch {
                console.log(message.Body);
            }
        } else {
            console.log('[Worker] Message body is empty');
        }

        // Parse AMS payload directly (AMS uses Raw Message Delivery, no SNS envelope)
        console.log('[Worker] Parsing AMS payload...');
        const payload = parseAmsPayload(message.Body);
        console.log('[Worker] ✓ Payload parsed successfully');

        // Extract datasetId for logging (AMS uses snake_case: dataset_id)
        const datasetId =
            typeof payload === 'object' && payload !== null && 'dataset_id' in payload
                ? String(payload.dataset_id)
                : 'unknown';
        console.log(`[Worker] Dataset ID: ${datasetId}`);

        // Route to appropriate handler
        console.log('[Worker] Routing to handler...');
        await routePayload(payload);
        console.log('[Worker] ✓ Handler completed successfully');

        // Success - delete message from queue
        console.log('[Worker] Deleting message from queue...');
        await deleteMessage(message.ReceiptHandle);
        console.log(`[Worker] ✓ Successfully processed and deleted message ${messageId}`);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('');
    } catch (error) {
        // Log error but don't delete message - SQS will retry
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('');
        console.error('═══════════════════════════════════════════════════════════════');
        console.error(`[Worker] ✗ Failed to process message ${messageId}`);
        console.error('═══════════════════════════════════════════════════════════════');
        console.error(`[Worker] Error: ${errorMessage}`);
        if (error instanceof Error && error.stack) {
            console.error(`[Worker] Stack trace:`, error.stack);
        }
        console.error('[Worker] Message will NOT be deleted - SQS will retry');
        console.error('═══════════════════════════════════════════════════════════════');
        console.error('');
        // Don't delete - let SQS handle retries and DLQ routing
        throw error;
    }
}

/**
 * Check if worker is enabled in the database
 */
async function isWorkerEnabled(): Promise<boolean> {
    try {
        const control = await db
            .select()
            .from(worker_control)
            .where(eq(worker_control.id, 'main'))
            .limit(1);

        // If no row exists, default to enabled (backward compatibility)
        if (control.length === 0) {
            // Initialize the row with enabled = true
            try {
                await db.insert(worker_control).values({ id: 'main', enabled: true });
            } catch {
                // Row might have been created by another process, ignore
            }
            return true;
        }

        return control[0].enabled;
    } catch (error) {
        // On error, default to enabled to avoid breaking existing behavior
        console.error('[Worker] Error checking worker control state:', error);
        return true;
    }
}

/**
 * Main worker loop
 */
async function runWorker(): Promise<void> {
    while (!shuttingDown) {
        try {
            // Check if worker is enabled before processing
            const enabled = await isWorkerEnabled();
            if (!enabled) {
                console.log(
                    '[Worker] Queue processing is disabled. Waiting 5 seconds before checking again...'
                );
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }

            // Long-poll for messages (will return after WaitTimeSeconds or when messages arrive)
            const messages = await receiveMessages();

            // If shutting down, exit immediately without processing
            if (shuttingDown) {
                break;
            }

            if (messages.length === 0) {
                // No messages - continue polling
                continue;
            }

            // TEMPORARY: Process only one message per iteration, then wait 10 seconds
            // Process the first message only
            const message = messages[0];

            // Check shutdown flag before processing
            if (shuttingDown) {
                break;
            }

            try {
                await processMessage(message);
            } catch {}

            // Wait 10 seconds before processing next message
            console.log('[Worker] Waiting 10 seconds before processing next message...');
            await new Promise(resolve => setTimeout(resolve, 10000));
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
