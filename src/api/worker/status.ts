import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '@/db/index.js';
import { workerControl } from '@/db/schema.js';

export function registerStatusRoute(fastify: FastifyInstance) {
    // Get current worker status
    fastify.get('/api/worker/status', async () => {
        try {
            const control = await db
                .select()
                .from(workerControl)
                .where(eq(workerControl.id, 'main'))
                .limit(1);

            // If no row exists, default to enabled and initialize the row
            if (control.length === 0) {
                // Initialize the row with enabled = true and messagesPerSecond = 0 (unlimited)
                try {
                    await db
                        .insert(workerControl)
                        .values({ id: 'main', enabled: true, messagesPerSecond: 0 });
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
    });
}
