import Bottleneck from 'bottleneck';
import { eq } from 'drizzle-orm';
import { db, testConnection } from '@/db/index';
import { workerControl } from '@/db/schema';
import { hasCurrentAccountAccess } from '@/jobs/account-access-gate';
import { createContextLogger } from '@/utils/logger';
import { resolveAmsAccountIds } from './account-resolution';
import { createDatabaseAmsAccountLookup } from './database-account-resolution';
import { type AmsMessage, processAmsMessage } from './message-processor';
import { routePayload } from './router';
import { deleteMessage, receiveMessages, testAwsConnection } from './sqs-client';

const logger = createContextLogger({ component: 'worker' });

logger.info('Starting Amazon Marketing Stream worker');

// Graceful shutdown flag
let shuttingDown = false;

const accountLookup = createDatabaseAmsAccountLookup(db);

const processMessage = async (message: AmsMessage): Promise<void> => {
    try {
        const result = await processAmsMessage(message, {
            checkAccountAccess: hasCurrentAccountAccess,
            deleteMessage,
            resolveAccountIds: payload => resolveAmsAccountIds(payload, accountLookup),
            routePayload,
        });

        if (result.status === 'skipped') {
            logger.warn(
                {
                    accountIds: result.accountIds,
                    datasetId: result.datasetId,
                    messageId: message.MessageId || 'unknown',
                    reason: result.reason,
                },
                'Skipped AMS message; it remains queued for a future retry'
            );
        }
    } catch (error) {
        logger.error({ errorType: error instanceof Error ? error.name : 'unknown', messageId: message.MessageId || 'unknown' }, 'Failed to process AMS message; it remains queued for retry');
        throw error;
    }
};

/**
 * Get worker configuration from the database
 */
async function getWorkerConfig(): Promise<{ enabled: boolean; messagesPerSecond: number }> {
    try {
        const control = await db.select().from(workerControl).where(eq(workerControl.id, 'main')).limit(1);

        // If no row exists, default to enabled with unlimited speed (backward compatibility)
        if (control.length === 0) {
            // Initialize the row with enabled = true and messagesPerSecond = 0 (unlimited)
            try {
                await db.insert(workerControl).values({ id: 'main', enabled: true, messagesPerSecond: 0 });
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
        logger.error({ err: error }, 'Error checking worker control state');
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
                logger.info('Queue processing is disabled. Waiting 5 seconds before checking again');
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
            const messages = await receiveMessages(waitTimeSeconds);

            // If shutting down, exit immediately without processing
            if (shuttingDown) {
                break;
            }

            if (messages.length === 0) {
                // No messages - wait 60 seconds before polling again
                await new Promise(resolve => setTimeout(resolve, 60_000));
                continue;
            }

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
                }
                // No rate limiting - process immediately
                return processMessage(message).catch(() => {
                    // Error already logged in processMessage
                });
            });

            // Wait for all messages in the batch to be processed
            await Promise.all(processPromises);
            logger.info({ messageCount: messages.length }, 'Completed processing batch');
        } catch (error) {
            // If shutting down, exit on error
            if (shuttingDown) {
                break;
            }

            // Log polling errors but continue (credentials should have been checked at startup)
            logger.error({ err: error }, 'Error during polling');
            // Wait a bit before retrying to avoid tight error loops
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    logger.info('Worker loop exited');
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
    logger.info({ signal }, 'Received shutdown signal, shutting down gracefully');
    logger.info('Stopping message polling. Current batch will finish processing.');
    shuttingDown = true;

    // Don't call process.exit() here - let the worker loop exit naturally
    // The main async function will handle cleanup and exit
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
    logger.error({ err: reason, promise }, 'Unhandled rejection');
});

process.on('uncaughtException', error => {
    logger.error({ err: error }, 'Uncaught exception');
    process.exit(1);
});

// Start the worker
(async () => {
    try {
        // Test database connection
        await testConnection();
        logger.info('Database connection verified');

        // Test AWS credentials and queue access
        let awsReady = false;
        try {
            await testAwsConnection();
            logger.info('AWS credentials verified');
            awsReady = true;
        } catch (error) {
            const _errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(
                {
                    err: error,
                    message: 'AWS credentials not available',
                    fix: 'Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars, configure IAM role with SQS permissions, or mount ~/.aws/credentials file',
                },
                'AWS credentials error - Worker will not start SQS polling until credentials are configured'
            );
        }

        if (!awsReady) {
            // Keep container alive but don't start polling
            logger.info('Waiting for AWS credentials to be configured');
            // Wait indefinitely (container stays up, logs visible)
            await new Promise(() => {
                // Never resolves - keeps container alive
            });
        }

        // Print startup status summary
        logger.info(
            {
                queue: process.env.AMS_QUEUE_URL,
                region: process.env.AWS_REGION || 'us-east-1',
            },
            'BidBeacon Worker Ready'
        );

        // Start the main loop
        await runWorker();

        // Worker loop exited cleanly
        logger.info('Shutdown complete');
        process.exit(0);
    } catch (error) {
        logger.error({ err: error }, 'Fatal startup error');
        process.exit(1);
    }
})();
