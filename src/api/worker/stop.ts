import type { FastifyInstance } from 'fastify';
import { db } from '@/db/index.js';
import { workerControl } from '@/db/schema.js';

export function registerStopRoute(fastify: FastifyInstance) {
    // Stop the queue (disable processing)
    fastify.post('/api/worker/stop', async (_request, reply) => {
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
}
