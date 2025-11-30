import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '@/db/index.js';
import { worker_control } from '@/db/schema.js';

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
    fastify.post('/api/worker/start', async () => {
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
            return {
                success: false,
                error: errorMessage,
            };
        }
    });

    // Stop the queue (disable processing)
    fastify.post('/api/worker/stop', async () => {
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
            return {
                success: false,
                error: errorMessage,
            };
        }
    });
}

