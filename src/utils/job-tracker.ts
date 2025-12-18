/**
 * Job Tracker Utility
 *
 * Tracks job invocations for monitoring and analytics.
 * Logs metrics to the database asynchronously to avoid blocking job execution.
 */

import { db } from '@/db/index.js';
import { jobMetrics } from '@/db/schema.js';
import { emitEvent } from '@/utils/events.js';
import { logger } from '@/utils/logger';

export interface JobMetadata {
    [key: string]: unknown; // Flexible metadata object
}

/**
 * Tracks a job invocation by logging it to the database.
 * Awaits the database write to ensure metrics are persisted before events are emitted.
 *
 * @param jobName - Name of the job (e.g., 'update-report-datasets')
 * @param startTime - When the job started
 * @param endTime - When the job completed
 * @param success - Whether the job succeeded
 * @param error - Error message (if failed)
 * @param metadata - Optional job-specific metadata
 */
export async function trackJobInvocation(jobName: string, startTime: Date, endTime: Date, success: boolean, error?: string, metadata?: JobMetadata): Promise<void> {
    try {
        await db.insert(jobMetrics).values({
            jobName,
            success,
            startTime,
            endTime,
            error: error ?? null,
            metadata: metadata ?? null,
        });

        // Notify connected clients that job metrics have been updated
        emitEvent({ type: 'job-metrics:updated', jobName });
    } catch (err) {
        // Silently fail - we don't want tracking failures to break jobs
        logger.error({ err, jobName }, 'Failed to track job invocation');
    }
}
