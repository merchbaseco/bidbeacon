import type { FastifyInstance } from 'fastify';
import { getDlqUrlFromMainQueue, getQueueMetrics } from '@/worker/sqsClient.js';

export function registerMetricsRoute(fastify: FastifyInstance) {
    // Get queue metrics for monitoring
    fastify.get('/api/worker/metrics', async () => {
        try {
            const mainQueueUrl = process.env.AMS_QUEUE_URL;

            if (!mainQueueUrl) {
                return {
                    success: false,
                    error: 'AMS_QUEUE_URL not configured',
                };
            }

            // Get main queue metrics
            const mainQueueMetrics = await getQueueMetrics(mainQueueUrl);

            // Get DLQ URL from main queue's RedrivePolicy
            const dlqUrlFromPolicy = await getDlqUrlFromMainQueue(mainQueueUrl);

            // Get DLQ metrics if DLQ is configured via RedrivePolicy
            let dlqMetrics = null;
            if (dlqUrlFromPolicy) {
                try {
                    dlqMetrics = await getQueueMetrics(dlqUrlFromPolicy);
                } catch (error) {
                    // Log the error so we can debug DLQ access issues
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    const isAccessDenied =
                        errorMessage.includes('not authorized') ||
                        errorMessage.includes('AccessDenied');

                    if (isAccessDenied) {
                        console.error('[API] ⚠️  DLQ access denied - IAM permissions missing');
                        console.error(
                            '[API] The IAM user needs sqs:GetQueueAttributes permission on the DLQ'
                        );
                        console.error('[API] DLQ URL:', dlqUrlFromPolicy);
                        console.error('[API] See INFRA.md for required IAM permissions');
                    } else {
                        console.error('[API] Error fetching DLQ metrics:', errorMessage);
                    }

                    if (error instanceof Error && error.stack && !isAccessDenied) {
                        console.error('[API] DLQ error stack:', error.stack);
                    }

                    // DLQ might not exist or be accessible, return empty metrics
                    dlqMetrics = {
                        sparkline: new Array(60).fill(0),
                        sparklineSent: new Array(60).fill(0),
                        sparklineReceived: new Array(60).fill(0),
                        sparklineDeleted: new Array(60).fill(0),
                        messagesLastHour: 0,
                        messagesLast24h: 0,
                        approximateVisible: 0,
                        oldestMessageAge: 0,
                        messagesSentLastHour: 0,
                        messagesSentLast24h: 0,
                        messagesReceivedLastHour: 0,
                        messagesReceivedLast24h: 0,
                        messagesDeletedLastHour: 0,
                        messagesDeletedLast24h: 0,
                        messagesSentLast60s: 0,
                        messagesReceivedLast60s: 0,
                        messagesDeletedLast60s: 0,
                    };
                }
            } else {
                // No DLQ configured, return empty metrics
                dlqMetrics = {
                    sparkline: new Array(60).fill(0),
                    sparklineSent: new Array(60).fill(0),
                    sparklineReceived: new Array(60).fill(0),
                    sparklineDeleted: new Array(60).fill(0),
                    messagesLastHour: 0,
                    messagesLast24h: 0,
                    approximateVisible: 0,
                    oldestMessageAge: 0,
                    messagesSentLastHour: 0,
                    messagesSentLast24h: 0,
                    messagesReceivedLastHour: 0,
                    messagesReceivedLast24h: 0,
                    messagesDeletedLastHour: 0,
                    messagesDeletedLast24h: 0,
                    messagesSentLast60s: 0,
                    messagesReceivedLast60s: 0,
                    messagesDeletedLast60s: 0,
                };
            }

            return {
                success: true,
                mainQueue: mainQueueMetrics,
                dlq: dlqMetrics,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                error: errorMessage,
            };
        }
    });
}
