/**
 * API Tracker Utility
 *
 * Tracks API invocations for monitoring and analytics.
 * Logs metrics to the database asynchronously to avoid blocking API calls.
 */

import { db } from '@/db/index.js';
import { apiMetrics } from '@/db/schema.js';
import { emitEvent } from '@/utils/events.js';

export interface ApiCallOptions {
    apiName: string;
    region: string;
}

/**
 * Tracks an API call by logging it to the database.
 * Awaits the database write to ensure metrics are persisted before events are emitted.
 *
 * @param options - API call options
 * @param startTime - When the API call started (performance.now() timestamp)
 * @param success - Whether the call succeeded
 * @param statusCode - HTTP status code (if available)
 * @param error - Error message (if failed)
 */
export async function trackApiCall(options: ApiCallOptions, startTime: number, success: boolean, statusCode?: number, error?: string): Promise<void> {
    const durationMs = Math.round(performance.now() - startTime);
    const timestamp = new Date();

    try {
        await db.insert(apiMetrics).values({
            apiName: options.apiName,
            region: options.region,
            statusCode: statusCode ?? null,
            success,
            durationMs,
            timestamp,
            error: error ?? null,
        });

        // Notify connected clients that API metrics have been updated
        emitEvent({ type: 'api-metrics:updated', apiName: options.apiName });
    } catch (err) {
        // Silently fail - we don't want tracking failures to break the app
        console.error('Failed to track API call:', err);
    }
}

/**
 * Wraps an async function to automatically track API calls.
 *
 * @param options - API call options
 * @param fn - The function to wrap (should return a Response-like object with status, or the actual result)
 * @returns The result of the wrapped function
 */
export async function withTracking<T>(options: ApiCallOptions, fn: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    let success = false;
    let statusCode: number | undefined;
    let error: string | undefined;

    try {
        const result = await fn();
        success = true;

        // Try to extract status code from result object if available
        if (result && typeof result === 'object' && 'statusCode' in result) {
            statusCode = (result as { statusCode: number }).statusCode;
        }

        return result;
    } catch (err) {
        error = err instanceof Error ? err.message : String(err);

        // Try to extract status code from error object or message
        if (err instanceof Error) {
            // Check if statusCode is attached to error
            if ('statusCode' in err && typeof (err as Error & { statusCode?: number }).statusCode === 'number') {
                statusCode = (err as Error & { statusCode: number }).statusCode;
            } else {
                // Try to extract from error message
                const statusMatch = err.message.match(/(?:status|Status|HTTP)\s*:?\s*(\d{3})|(\d{3})\s+(?:error|Error|status|Status)/i) || err.message.match(/^(\d{3})\s/);
                if (statusMatch) {
                    statusCode = parseInt(statusMatch[1] || statusMatch[2], 10);
                }
            }
        }

        throw err;
    } finally {
        // Track the call - await to ensure metrics are written before events are emitted
        await trackApiCall(options, startTime, success, statusCode, error);
    }
}
