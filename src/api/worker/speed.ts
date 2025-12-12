import type { FastifyInstance } from 'fastify';
import { db } from '@/db/index.js';
import { workerControl } from '@/db/schema.js';

export function registerSpeedRoute(fastify: FastifyInstance) {
    // Set messages per second rate limit
    fastify.post<{ Body: { messagesPerSecond: number } }>(
        '/api/worker/speed',
        async (request, reply) => {
            try {
                const { messagesPerSecond } = request.body;

                // Validate input
                if (typeof messagesPerSecond !== 'number' || messagesPerSecond < 0) {
                    return reply.code(400).send({
                        success: false,
                        error: 'messagesPerSecond must be a non-negative number (0 = unlimited)',
                    });
                }

                const result = await db
                    .insert(workerControl)
                    .values({ id: 'main', messagesPerSecond })
                    .onConflictDoUpdate({
                        target: workerControl.id,
                        set: {
                            messagesPerSecond,
                            updatedAt: new Date(),
                        },
                    })
                    .returning();

                return {
                    success: true,
                    enabled: result[0].enabled,
                    messagesPerSecond: result[0].messagesPerSecond ?? 0,
                    message: `Rate limit set to ${messagesPerSecond === 0 ? 'unlimited' : `${messagesPerSecond} messages/second`}`,
                    updatedAt: result[0].updatedAt,
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('[API] Error setting rate limit:', errorMessage);
                if (error instanceof Error && error.stack) {
                    console.error('[API] Stack trace:', error.stack);
                }
                return reply.code(500).send({
                    success: false,
                    error: errorMessage,
                });
            }
        }
    );
}
