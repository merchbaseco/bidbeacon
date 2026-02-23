/**
 * Amazon Ads API Throttled Fetch
 *
 * Provides rate-limited fetch wrapper using bottleneck to prevent API hammering.
 * Dynamically adjusts rate limits based on Retry-After headers.
 */

import Bottleneck from 'bottleneck';

type RetryOptions = {
    attempts: number;
    baseDelayMs: number;
    backoffMultiplier?: number;
    maxDelayMs?: number;
    retryableStatusCodes?: number[];
    retryOnNetworkError?: boolean;
};

type ThrottledFetchOptions = RequestInit & {
    retry?: RetryOptions;
    timeoutMs?: number;
};

const DEFAULT_RETRYABLE_STATUS_CODES = [408, 409, 429, 500, 502, 503, 504];
const DEFAULT_BACKOFF_MULTIPLIER = 2;
const DEFAULT_RETRY_AFTER_BUFFER_MS = 100;
const noop = () => undefined;

export const AMAZON_ADS_API_RETRY: RetryOptions = {
    attempts: 3,
    baseDelayMs: 1000,
    backoffMultiplier: DEFAULT_BACKOFF_MULTIPLIER,
    maxDelayMs: 10_000,
    retryableStatusCodes: DEFAULT_RETRYABLE_STATUS_CODES,
    retryOnNetworkError: true,
};

// Singleton bottleneck instance shared across all API calls
const limiter = new Bottleneck({
    maxConcurrent: 2, // Allow 2 concurrent requests
    minTime: 500, // Minimum 500ms between requests (~2 req/sec baseline)
});

// Track the last Retry-After value to gradually reduce back to default
let lastRetryAfter: number | null = null;
const DEFAULT_MIN_TIME = 500;

/**
 * Throttled fetch wrapper that respects rate limits and Retry-After headers.
 * Compatible with native fetch API.
 * @param url - Request URL
 * @param options - Fetch options (same as native fetch)
 * @returns Promise resolving to Response
 */
export async function throttledFetch(url: string | URL | Request, options?: ThrottledFetchOptions): Promise<Response> {
    const { retry, timeoutMs, ...fetchOptions } = options ?? {};
    const resolvedRetry = retry ? normalizeRetryOptions(retry) : null;
    const resolvedTimeoutMs = normalizeTimeoutMs(timeoutMs);
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const method = fetchOptions.method || 'GET';

    let attempt = 1;
    let lastNetworkError: Error | null = null;

    while (attempt <= (resolvedRetry?.attempts ?? 1)) {
        try {
            const response = await limiter.schedule(async () => {
                const { options: attemptFetchOptions, cleanup } = createAttemptFetchOptions(fetchOptions, resolvedTimeoutMs);
                try {
                    return await fetch(url, attemptFetchOptions);
                } finally {
                    cleanup();
                }
            });

            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const retryAfterMs = parseRetryAfter(retryAfter);

                if (retryAfterMs !== null) {
                    handleRetryAfter(retryAfterMs);
                } else {
                    const backoffMs = lastRetryAfter ? lastRetryAfter * 2 : 5000;
                    handleRetryAfter(backoffMs);
                }
            }

            if (!(resolvedRetry && shouldRetryResponse(response.status, resolvedRetry, attempt))) {
                return response;
            }

            await drainResponseBody(response);
            const retryDelayMs = getRetryDelayMs(response.headers, resolvedRetry, attempt);
            if (retryDelayMs > 0) {
                await sleep(retryDelayMs);
            }
        } catch (error) {
            const wrappedError = wrapNetworkError(error, method, urlString);
            lastNetworkError = wrappedError;

            if (!(resolvedRetry && shouldRetryNetworkError(resolvedRetry, attempt))) {
                throw wrappedError;
            }

            const retryDelayMs = getRetryDelayMs(null, resolvedRetry, attempt);
            if (retryDelayMs > 0) {
                await sleep(retryDelayMs);
            }
        }

        attempt += 1;
    }

    if (lastNetworkError) {
        throw lastNetworkError;
    }

    throw new Error(`Amazon Ads request failed after ${resolvedRetry?.attempts ?? 1} attempts without a response.`);
}

function normalizeRetryOptions(options: RetryOptions): RetryOptions {
    return {
        attempts: Math.max(1, options.attempts),
        baseDelayMs: Math.max(0, options.baseDelayMs),
        backoffMultiplier: options.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER,
        maxDelayMs: options.maxDelayMs,
        retryableStatusCodes: options.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES,
        retryOnNetworkError: options.retryOnNetworkError ?? true,
    };
}

function normalizeTimeoutMs(timeoutMs?: number): number | null {
    if (timeoutMs === undefined || !Number.isFinite(timeoutMs)) {
        return null;
    }

    const normalizedTimeoutMs = Math.trunc(timeoutMs);
    if (normalizedTimeoutMs <= 0) {
        return null;
    }

    return normalizedTimeoutMs;
}

function createAttemptFetchOptions(fetchOptions: RequestInit, timeoutMs: number | null): { options: RequestInit; cleanup: () => void } {
    if (timeoutMs === null) {
        return { options: fetchOptions, cleanup: noop };
    }

    const timeoutController = new AbortController();
    const parentSignal = fetchOptions.signal;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let removeParentAbortListener: (() => void) | null = null;

    timeoutId = setTimeout(() => {
        timeoutController.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    }, timeoutMs);

    if (parentSignal) {
        if (parentSignal.aborted) {
            timeoutController.abort(parentSignal.reason);
        } else {
            const onParentAbort = () => timeoutController.abort(parentSignal.reason);
            parentSignal.addEventListener('abort', onParentAbort, { once: true });
            removeParentAbortListener = () => parentSignal.removeEventListener('abort', onParentAbort);
        }
    }

    return {
        options: {
            ...fetchOptions,
            signal: timeoutController.signal,
        },
        cleanup: () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            removeParentAbortListener?.();
            removeParentAbortListener = null;
        },
    };
}

function shouldRetryResponse(status: number, options: RetryOptions, attempt: number): boolean {
    if (attempt >= options.attempts) {
        return false;
    }

    return (options.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES).includes(status);
}

function shouldRetryNetworkError(options: RetryOptions, attempt: number): boolean {
    if (attempt >= options.attempts) {
        return false;
    }

    return options.retryOnNetworkError ?? true;
}

function getRetryDelayMs(headers: Headers | null, options: RetryOptions, attempt: number): number {
    const retryAfterMs = parseRetryAfter(headers?.get('Retry-After') ?? null);
    const exponentialDelay = computeBackoffMs(options.baseDelayMs, options.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER, attempt, options.maxDelayMs);

    if (retryAfterMs !== null) {
        return Math.max(retryAfterMs + DEFAULT_RETRY_AFTER_BUFFER_MS, exponentialDelay);
    }

    return exponentialDelay;
}

function computeBackoffMs(baseDelayMs: number, multiplier: number, attempt: number, maxDelayMs?: number): number {
    const delay = baseDelayMs * multiplier ** Math.max(0, attempt - 1);
    if (maxDelayMs === undefined) {
        return delay;
    }
    return Math.min(delay, maxDelayMs);
}

function wrapNetworkError(error: unknown, method: string, urlString: string): Error {
    if (error instanceof Error) {
        const enhancedError = new Error(`Network error during ${method} ${urlString}: ${error.message}`);
        (enhancedError as Error & { cause?: Error }).cause = error;
        return enhancedError;
    }

    return new Error(`Network error during ${method} ${urlString}: ${String(error)}`);
}

async function drainResponseBody(response: Response): Promise<void> {
    try {
        await response.arrayBuffer();
    } catch {
        // Ignore body read errors when retrying.
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
    const numericValue = Number.parseInt(retryAfter, 10);
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
    const minTime = retryAfterMs + DEFAULT_RETRY_AFTER_BUFFER_MS;

    limiter.updateSettings({ minTime });

    // Gradually reduce back to default after the retry period
    // This allows us to resume normal operation once the rate limit window passes
    setTimeout(() => {
        limiter.updateSettings({ minTime: DEFAULT_MIN_TIME });
        lastRetryAfter = null;
    }, retryAfterMs);
}
