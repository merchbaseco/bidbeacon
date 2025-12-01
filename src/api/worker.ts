import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '@/db/index.js';
import { worker_control } from '@/db/schema.js';
import { getQueueMetrics } from '@/worker/sqsClient.js';

export async function registerWorkerRoutes(fastify: FastifyInstance) {
    // Get current worker status
    fastify.get('/api/worker/status', async () => {
        try {
            const control = await db
                .select()
                .from(worker_control)
                .where(eq(worker_control.id, 'main'))
                .limit(1);

            // If no row exists, default to enabled and initialize the row
            if (control.length === 0) {
                // Initialize the row with enabled = true
                try {
                    await db.insert(worker_control).values({ id: 'main', enabled: true });
                } catch {
                    // Row might have been created by another request, ignore
                }
                return {
                    success: true,
                    enabled: true,
                    message: 'Worker is enabled (default)',
                };
            }

            return {
                success: true,
                enabled: control[0].enabled,
                updatedAt: control[0].updatedAt,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                error: errorMessage,
            };
        }
    });

    // Start the queue (enable processing)
    fastify.post('/api/worker/start', async (_request, reply) => {
        try {
            const result = await db
                .insert(worker_control)
                .values({ id: 'main', enabled: true })
                .onConflictDoUpdate({
                    target: worker_control.id,
                    set: {
                        enabled: true,
                        updatedAt: new Date(),
                    },
                })
                .returning();

            return {
                success: true,
                enabled: result[0].enabled,
                message: 'Queue processing started',
                updatedAt: result[0].updatedAt,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[API] Error starting queue:', errorMessage);
            if (error instanceof Error && error.stack) {
                console.error('[API] Stack trace:', error.stack);
            }
            return reply.code(500).send({
                success: false,
                error: errorMessage,
            });
        }
    });

    // Stop the queue (disable processing)
    fastify.post('/api/worker/stop', async (_request, reply) => {
        try {
            const result = await db
                .insert(worker_control)
                .values({ id: 'main', enabled: false })
                .onConflictDoUpdate({
                    target: worker_control.id,
                    set: {
                        enabled: false,
                        updatedAt: new Date(),
                    },
                })
                .returning();

            return {
                success: true,
                enabled: result[0].enabled,
                message: 'Queue processing stopped',
                updatedAt: result[0].updatedAt,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[API] Error starting queue:', errorMessage);
            if (error instanceof Error && error.stack) {
                console.error('[API] Stack trace:', error.stack);
            }
            return reply.code(500).send({
                success: false,
                error: errorMessage,
            });
        }
    });

    // Get queue metrics for monitoring
    fastify.get('/api/worker/metrics', async () => {
        try {
            const mainQueueUrl = process.env.AMS_QUEUE_URL;
            const dlqUrl = process.env.AWS_QUEUE_DLQ_URL;

            if (!mainQueueUrl) {
                return {
                    success: false,
                    error: 'AMS_QUEUE_URL not configured',
                };
            }

            // Get main queue metrics
            const mainQueueMetrics = await getQueueMetrics(mainQueueUrl);

            // Get DLQ metrics if configured
            let dlqMetrics = null;
            if (dlqUrl) {
                try {
                    dlqMetrics = await getQueueMetrics(dlqUrl);
                } catch {
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
                    };
                }
            } else {
                // No DLQ configured, return empty metrics
                dlqMetrics = {
                    sparkline: new Array(60).fill(0),
                    messagesLastHour: 0,
                    messagesLast24h: 0,
                    approximateVisible: 0,
                    oldestMessageAge: 0,
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
