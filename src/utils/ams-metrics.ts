import { db } from '@/db/index';
import { amsMetrics } from '@/db/schema';

/**
 * Track AMS event processing metrics
 * Wraps handler execution and records success/failure with timing
 */
export async function trackAmsEvent<T>(entityType: string, handler: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    try {
        const result = await handler();
        const durationMs = Math.round(performance.now() - startTime);
        // Insert success metric (don't await - fire and forget)
        db.insert(amsMetrics)
            .values({
                timestamp: new Date(),
                entityType,
                success: true,
                durationMs,
            })
            .catch(() => undefined); // Silently fail - don't break handler
        return result;
    } catch (error) {
        const durationMs = Math.round(performance.now() - startTime);
        // Insert failure metric (don't await)
        db.insert(amsMetrics)
            .values({
                timestamp: new Date(),
                entityType,
                success: false,
                durationMs,
                error: error instanceof Error ? error.message : String(error),
            })
            .catch(() => undefined);
        throw error; // Re-throw to let SQS handle retries
    }
}
