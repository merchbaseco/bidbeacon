import { testConnection } from '@/db/index.js';
import { routePayload } from './router.js';
import { snsEnvelopeSchema } from './schemas.js';
import { deleteMessage, receiveMessages } from './sqsClient.js';

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
            // Log polling errors but continue
            console.error('[Worker] Error during polling:', error);
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

        // Start the main loop
        console.log('[Worker] Starting message polling loop...');
        await runWorker();

        // Worker loop exited cleanly
        console.log('[Worker] Shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('[Worker] Fatal error:', error);
        process.exit(1);
    }
})();
