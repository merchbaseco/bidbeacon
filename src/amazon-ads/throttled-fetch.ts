/**
 * Amazon Ads API Throttled Fetch
 *
 * Provides rate-limited fetch wrapper using bottleneck to prevent API hammering.
 * Dynamically adjusts rate limits based on Retry-After headers.
 */

import Bottleneck from 'bottleneck';
import { logger } from '@/utils/logger.js';

// Singleton bottleneck instance shared across all API calls
const limiter = new Bottleneck({
    maxConcurrent: 2, // Allow 2 concurrent requests
    minTime: 500, // Minimum 500ms between requests (~2 req/sec baseline)
});

// Track the last Retry-After value to gradually reduce back to default
let lastRetryAfter: number | null = null;
const DEFAULT_MIN_TIME = 500;

/**
 * Parse Retry-After header value.
 * Supports both numeric (seconds) and HTTP-date formats.
 * @param retryAfter - The Retry-After header value
 * @returns Number of milliseconds to wait, or null if invalid
 */
function parseRetryAfter(retryAfter: string | null): number | null {
    if (!retryAfter) {
        return null;
    }

    // Try parsing as numeric seconds
    const numericValue = parseInt(retryAfter, 10);
    if (!Number.isNaN(numericValue) && numericValue > 0) {
        return numericValue * 1000; // Convert to milliseconds
    }

    // Try parsing as HTTP-date
    const dateValue = Date.parse(retryAfter);
    if (!Number.isNaN(dateValue)) {
        const waitMs = dateValue - Date.now();
        return waitMs > 0 ? waitMs : null;
    }

    return null;
}

/**
 * Update bottleneck settings based on Retry-After header.
 * Temporarily increases minTime to respect the wait period.
 * @param retryAfterMs - Milliseconds to wait from Retry-After header
 */
function handleRetryAfter(retryAfterMs: number): void {
    lastRetryAfter = retryAfterMs;

    // Update bottleneck to respect the retry-after period
    // Add a small buffer to ensure we don't retry too early
    const minTime = retryAfterMs + 100;

    limiter.updateSettings({ minTime });

    logger.warn({ retryAfterMs, minTime }, 'Rate limit hit, adjusting throttler based on Retry-After header');

    // Gradually reduce back to default after the retry period
    // This allows us to resume normal operation once the rate limit window passes
    setTimeout(() => {
        limiter.updateSettings({ minTime: DEFAULT_MIN_TIME });
        lastRetryAfter = null;
        logger.info('Throttler reset to default rate after Retry-After period');
    }, retryAfterMs);
}

/**
 * Throttled fetch wrapper that respects rate limits and Retry-After headers.
 * Compatible with native fetch API.
 * @param url - Request URL
 * @param options - Fetch options (same as native fetch)
 * @returns Promise resolving to Response
 */
export async function throttledFetch(url: string | URL | Request, options?: RequestInit): Promise<Response> {
    return limiter.schedule(async () => {
        const response = await fetch(url, options);

        // Check for rate limit response (429 Too Many Requests)
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const retryAfterMs = parseRetryAfter(retryAfter);

            if (retryAfterMs !== null) {
                handleRetryAfter(retryAfterMs);
            } else {
                // If Retry-After is missing or invalid, use exponential backoff
                const backoffMs = lastRetryAfter ? lastRetryAfter * 2 : 5000;
                logger.warn({ backoffMs }, 'Rate limit hit but no valid Retry-After header, using exponential backoff');
                handleRetryAfter(backoffMs);
            }
        }

        return response;
    });
}
