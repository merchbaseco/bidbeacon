import { testConnection } from '@/db/index.js';
import { routePayload } from './router.js';
import { snsEnvelopeSchema } from './schemas.js';
import { deleteMessage, receiveMessages, testAwsConnection } from './sqsClient.js';

console.log('[Worker] Starting Amazon Marketing Stream worker...');

// Graceful shutdown flag
let shuttingDown = false;

/**
 * Parse SNS envelope from SQS message body
 */
function parseSnsEnvelope(body: string | undefined): {
    Type: string;
    Message?: string;
    MessageId?: string;
    TopicArn?: string;
    SubscribeURL?: string;
    Token?: string;
} {
    if (!body) {
        throw new Error('Message body is empty');
    }

    try {
        const parsed = JSON.parse(body);
        const envelope = snsEnvelopeSchema.parse(parsed);
        return envelope;
    } catch (error) {
        throw new Error(
            `Failed to parse SNS envelope: ${error instanceof Error ? error.message : String(error)}`
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

    try {
        // Parse SNS envelope
        const envelope = parseSnsEnvelope(message.Body);

        // Handle subscription/unsubscription confirmations
        if (envelope.Type === 'SubscriptionConfirmation') {
            console.log(
                `[Worker] Received SubscriptionConfirmation for topic ${envelope.TopicArn}`
            );
            console.log(`[Worker] SubscribeURL: ${envelope.SubscribeURL}`);
            // Delete the message - we don't need to process these
            await deleteMessage(message.ReceiptHandle);
            return;
        }

        if (envelope.Type === 'UnsubscribeConfirmation') {
            console.log(`[Worker] Received UnsubscribeConfirmation for topic ${envelope.TopicArn}`);
            // Delete the message - we don't need to process these
            await deleteMessage(message.ReceiptHandle);
            return;
        }

        // Handle actual notifications
        if (envelope.Type !== 'Notification') {
            console.warn(`[Worker] Unknown SNS message type: ${envelope.Type}. Deleting message.`);
            await deleteMessage(message.ReceiptHandle);
            return;
        }

        if (!envelope.Message) {
            throw new Error('Notification message is empty');
        }

        // Parse the AMS payload from the SNS message
        const payload = JSON.parse(envelope.Message);

        // Route to appropriate handler
        await routePayload(payload);

        // Success - delete message from queue
        await deleteMessage(message.ReceiptHandle);
        console.log(`[Worker] Successfully processed message ${message.MessageId || 'unknown'}`);
    } catch (error) {
        // Log error but don't delete message - SQS will retry
        const messageId = message.MessageId || 'unknown';
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Worker] Failed to process message ${messageId}:`, errorMessage);
        if (error instanceof Error && error.stack) {
            console.error(`[Worker] Stack trace:`, error.stack);
        }
        // Don't delete - let SQS handle retries and DLQ routing
        throw error;
    }
}

/**
 * Main worker loop
 */
async function runWorker(): Promise<void> {
    while (!shuttingDown) {
        try {
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

            // Process each message in the current batch
            for (const message of messages) {
                // Check shutdown flag before each message
                if (shuttingDown) {
                    break;
                }

                try {
                    await processMessage(message);
                } catch {}
            }
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
