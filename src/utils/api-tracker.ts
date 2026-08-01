/**
 * API Tracker Utility
 *
 * Tracks API invocations for monitoring and analytics.
 * Logs metrics to the database asynchronously to avoid blocking API calls.
 */

import { db } from '@/db/index';
import { apiMetrics } from '@/db/schema';
import { type ApiMetricsUpdatedEvent, emitEvent } from '@/utils/events';

const STATUS_MESSAGE_REGEX = /(?:status|Status|HTTP)\s*:?\s*(\d{3})|(\d{3})\s+(?:error|Error|status|Status)/i;
const STATUS_PREFIX_REGEX = /^(\d{3})\s/;

export interface ApiCallOptions {
    apiName: string;
    region: string;
    requestMetrics?: ApiRequestMetrics;
}

export interface ApiRequestMetrics {
    amazonRetryAfterMs?: number | null;
    attemptCount?: number;
    governorCooldownMs?: number | null;
    queueWaitMs?: number;
    rateLimitCount?: number;
    rateLimitRequestId?: string | null;
    rateLimitResponseContentType?: string | null;
    rateLimitResponseServer?: string | null;
    retryCount?: number;
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
        const [insertedRow] = await db
            .insert(apiMetrics)
            .values({
                apiName: options.apiName,
                region: options.region,
                statusCode: statusCode ?? null,
                success,
                durationMs,
                attemptCount: options.requestMetrics?.attemptCount ?? 0,
                retryCount: options.requestMetrics?.retryCount ?? 0,
                rateLimitCount: options.requestMetrics?.rateLimitCount ?? 0,
                amazonRetryAfterMs: options.requestMetrics?.amazonRetryAfterMs ?? null,
                governorCooldownMs: options.requestMetrics?.governorCooldownMs ?? null,
                rateLimitRequestId: options.requestMetrics?.rateLimitRequestId ?? null,
                rateLimitResponseContentType: options.requestMetrics?.rateLimitResponseContentType ?? null,
                rateLimitResponseServer: options.requestMetrics?.rateLimitResponseServer ?? null,
                queueWaitMs: options.requestMetrics?.queueWaitMs ?? 0,
                timestamp,
                error: error ?? null,
            })
            .returning();

        // Notify connected clients that API metrics have been updated
        // Include the row data so clients can append it without refetching
        const event: Omit<ApiMetricsUpdatedEvent, 'timestamp'> = {
            type: 'api-metrics:updated',
            apiName: options.apiName,
            data: {
                apiName: insertedRow.apiName,
                region: insertedRow.region,
                statusCode: insertedRow.statusCode,
                success: insertedRow.success,
                durationMs: insertedRow.durationMs,
                attemptCount: insertedRow.attemptCount,
                retryCount: insertedRow.retryCount,
                rateLimitCount: insertedRow.rateLimitCount,
                amazonRetryAfterMs: insertedRow.amazonRetryAfterMs,
                governorCooldownMs: insertedRow.governorCooldownMs,
                rateLimitRequestId: insertedRow.rateLimitRequestId,
                rateLimitResponseContentType: insertedRow.rateLimitResponseContentType,
                rateLimitResponseServer: insertedRow.rateLimitResponseServer,
                queueWaitMs: insertedRow.queueWaitMs,
                timestamp: insertedRow.timestamp.toISOString(),
                error: insertedRow.error,
            },
        };
        emitEvent(event);
    } catch {
        // Silently fail - we don't want tracking failures to break the app
    }
}

/**
 * Wraps an async function to automatically track API calls.
 *
 * @param options - API call options
 * @param fn - The function to wrap (should return a Response-like object with status, or the actual result)
 * @returns The result of the wrapped function
 */
export async function withTracking<T>(options: ApiCallOptions, fn: (recordRequestMetrics: (metrics: ApiRequestMetrics) => void) => Promise<T>): Promise<T> {
    const requestMetrics: ApiRequestMetrics = {};
    const trackedOptions = { ...options, requestMetrics };
    const startTime = performance.now();
    let success = false;
    let statusCode: number | undefined;
    let error: string | undefined;

    try {
        const result = await fn(metrics => Object.assign(requestMetrics, metrics));
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
                const statusMatch = err.message.match(STATUS_MESSAGE_REGEX) || err.message.match(STATUS_PREFIX_REGEX);
                if (statusMatch) {
                    statusCode = Number.parseInt(statusMatch[1] || statusMatch[2], 10);
                }
            }
        }

        throw err;
    } finally {
        // Track the call - await to ensure metrics are written before events are emitted
        await trackApiCall(trackedOptions, startTime, success, statusCode, error);
    }
}
