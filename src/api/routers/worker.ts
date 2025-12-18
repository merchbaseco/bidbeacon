import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { workerControl } from '@/db/schema';
import { logger } from '@/utils/logger';
import { getDlqUrlFromMainQueue, getQueueMetrics } from '@/worker/sqsClient';
import { publicProcedure, router } from '../trpc';

export const workerRouter = router({
    status: publicProcedure.query(async () => {
        try {
            const control = await db.select().from(workerControl).where(eq(workerControl.id, 'main')).limit(1);

            if (control.length === 0) {
                try {
                    await db.insert(workerControl).values({ id: 'main', enabled: true, messagesPerSecond: 0 });
                } catch {
                    // Row might have been created by another request, ignore
                }
                return {
                    success: true,
                    enabled: true,
                    messagesPerSecond: 0,
                    message: 'Worker is enabled (default)',
                };
            }

            return {
                success: true,
                enabled: control[0].enabled,
                messagesPerSecond: control[0].messagesPerSecond ?? 0,
                updatedAt: control[0].updatedAt,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                error: errorMessage,
            };
        }
    }),

    start: publicProcedure.mutation(async () => {
        try {
            const result = await db
                .insert(workerControl)
                .values({ id: 'main', enabled: true, messagesPerSecond: 0 })
                .onConflictDoUpdate({
                    target: workerControl.id,
                    set: {
                        enabled: true,
                        updatedAt: new Date(),
                    },
                })
                .returning();

            return {
                success: true,
                enabled: result[0].enabled,
                messagesPerSecond: result[0].messagesPerSecond ?? 0,
                message: 'Queue processing started',
                updatedAt: result[0].updatedAt,
            };
        } catch (error) {
            logger.error({ err: error }, 'Error starting queue');
            throw error;
        }
    }),

    stop: publicProcedure.mutation(async () => {
        try {
            const result = await db
                .insert(workerControl)
                .values({ id: 'main', enabled: false, messagesPerSecond: 0 })
                .onConflictDoUpdate({
                    target: workerControl.id,
                    set: {
                        enabled: false,
                        updatedAt: new Date(),
                    },
                })
                .returning();

            return {
                success: true,
                enabled: result[0].enabled,
                messagesPerSecond: result[0].messagesPerSecond ?? 0,
                message: 'Queue processing stopped',
                updatedAt: result[0].updatedAt,
            };
        } catch (error) {
            logger.error({ err: error }, 'Error stopping queue');
            throw error;
        }
    }),

    speed: publicProcedure
        .input(
            z.object({
                messagesPerSecond: z.number().min(0),
            })
        )
        .mutation(async ({ input }) => {
            try {
                const result = await db
                    .insert(workerControl)
                    .values({ id: 'main', messagesPerSecond: input.messagesPerSecond })
                    .onConflictDoUpdate({
                        target: workerControl.id,
                        set: {
                            messagesPerSecond: input.messagesPerSecond,
                            updatedAt: new Date(),
                        },
                    })
                    .returning();

                return {
                    success: true,
                    enabled: result[0].enabled,
                    messagesPerSecond: result[0].messagesPerSecond ?? 0,
                    message: `Rate limit set to ${input.messagesPerSecond === 0 ? 'unlimited' : `${input.messagesPerSecond} messages/second`}`,
                    updatedAt: result[0].updatedAt,
                };
            } catch (error) {
                logger.error({ err: error }, 'Error setting rate limit');
                throw error;
            }
        }),

    metrics: publicProcedure.query(async () => {
        try {
            const mainQueueUrl = process.env.AMS_QUEUE_URL;

            if (!mainQueueUrl) {
                return {
                    success: false,
                    error: 'AMS_QUEUE_URL not configured',
                };
            }

            const mainQueueMetrics = await getQueueMetrics(mainQueueUrl);
            const dlqUrlFromPolicy = await getDlqUrlFromMainQueue(mainQueueUrl);

            let dlqMetrics = null;
            if (dlqUrlFromPolicy) {
                try {
                    dlqMetrics = await getQueueMetrics(dlqUrlFromPolicy);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    const isAccessDenied = errorMessage.includes('not authorized') || errorMessage.includes('AccessDenied');

                    if (isAccessDenied) {
                        logger.error(
                            {
                                dlqUrl: dlqUrlFromPolicy,
                                message: 'DLQ access denied - IAM permissions missing',
                                fix: 'The IAM user needs sqs:GetQueueAttributes permission on the DLQ. See INFRA.md for required IAM permissions',
                            },
                            'DLQ access denied'
                        );
                    } else {
                        logger.error({ err: error }, 'Error fetching DLQ metrics');
                    }

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
    }),
});
