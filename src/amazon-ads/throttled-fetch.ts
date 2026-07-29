/**
 * Amazon Ads API Throttled Fetch
 *
 * Provides rate-limited fetch wrapper using bottleneck to prevent API hammering.
 * Dynamically adjusts rate limits based on Retry-After headers.
 */

import Bottleneck from 'bottleneck';
import { loadRateLimitState, saveRateLimitState } from './rate-limit-store';

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
    throttle?: {
        group?: 'default' | 'report-create';
        key?: string;
        priority?: number;
    };
    onMetrics?: (metrics: ThrottledFetchMetrics) => void;
};

export type ThrottledFetchMetrics = {
    attemptCount: number;
    queueWaitMs: number;
    rateLimitCount: number;
    retryAfterMs: number | null;
    retryCount: number;
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

const DEFAULT_MIN_TIME = 500;
const MAX_FALLBACK_RETRY_AFTER_MS = 60_000;
const REPORT_CREATE_EXHAUSTION_BACKOFF_MS = [10 * 60_000, 20 * 60_000, 30 * 60_000] as const;
const REPORT_CREATE_EXHAUSTION_RESET_MS = 30 * 60_000;
const REPORT_CREATE_RECOVERY_MIN_TIME_MS = 10 * 60_000;

type LimiterState = {
    cooldownUntil: number;
    exhaustionCount: number;
    group: 'default' | 'report-create';
    hydration: Promise<void>;
    key: string;
    lastRateLimitAt: number;
    lastRetryAfterMs: number | null;
    limiter: Bottleneck;
    nextStartAt: number;
};

const limiterStates = new Map<string, LimiterState>();

/**
 * Throttled fetch wrapper that respects rate limits and Retry-After headers.
 * Compatible with native fetch API.
 * @param url - Request URL
 * @param options - Fetch options (same as native fetch)
 * @returns Promise resolving to Response
 */
export async function throttledFetch(url: string | URL | Request, options?: ThrottledFetchOptions): Promise<Response> {
    const { retry, timeoutMs, throttle, onMetrics, ...fetchOptions } = options ?? {};
    const throttleGroup = throttle?.group ?? 'default';
    const resolvedRetry = retry ? normalizeRetryOptions(retry) : null;
    const resolvedTimeoutMs = normalizeTimeoutMs(timeoutMs);
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const method = fetchOptions.method || 'GET';
    const limiterState = getLimiterState(throttleGroup, throttle?.key ?? 'global');
    const priority = normalizePriority(throttle?.priority);
    const metrics: ThrottledFetchMetrics = {
        attemptCount: 0,
        queueWaitMs: 0,
        rateLimitCount: 0,
        retryAfterMs: null,
        retryCount: 0,
    };

    let attempt = 1;
    let lastNetworkError: Error | null = null;

    try {
        while (attempt <= (resolvedRetry?.attempts ?? 1)) {
            metrics.attemptCount = attempt;
            try {
                const queuedAt = performance.now();
                const response = await limiterState.limiter.schedule({ priority }, async () => {
                    await limiterState.hydration;
                    await waitForStartSlot(limiterState);
                    metrics.queueWaitMs += Math.round(performance.now() - queuedAt);
                    const { options: attemptFetchOptions, cleanup } = createAttemptFetchOptions(fetchOptions, resolvedTimeoutMs);
                    try {
                        return await fetch(url, attemptFetchOptions);
                    } finally {
                        cleanup();
                    }
                });

                const shouldRetry = Boolean(resolvedRetry && shouldRetryResponse(response.status, resolvedRetry, attempt));
                if (response.status === 429) {
                    metrics.rateLimitCount += 1;
                    const retryAfter = response.headers.get('Retry-After');
                    const retryAfterMs = parseRetryAfter(retryAfter);
                    const cooldownMs = retryAfterMs ?? withJitter(getFallbackRetryAfterMs(limiterState));
                    metrics.retryAfterMs = Math.max(metrics.retryAfterMs ?? 0, cooldownMs);
                    await applyCooldown(limiterState, cooldownMs);

                    if (throttleGroup === 'report-create' && !shouldRetry) {
                        const exhaustionCooldownMs = await applyReportCreateExhaustionCooldown(limiterState);
                        metrics.retryAfterMs = Math.max(metrics.retryAfterMs ?? 0, exhaustionCooldownMs);
                    }
                } else if (response.ok && throttleGroup === 'report-create') {
                    await applyReportCreateRecoveryCooldown(limiterState, metrics.rateLimitCount > 0);
                }

                if (!(shouldRetry && resolvedRetry)) {
                    return response;
                }

                metrics.retryCount += 1;
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

                metrics.retryCount += 1;
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
    } finally {
        onMetrics?.(metrics);
    }
}

function getLimiterState(group: 'default' | 'report-create', key: string): LimiterState {
    const stateKey = `${group}:${key}`;
    const existingState = limiterStates.get(stateKey);
    if (existingState) {
        return existingState;
    }

    const state: LimiterState = {
        cooldownUntil: 0,
        exhaustionCount: 0,
        group,
        hydration: Promise.resolve(),
        key: stateKey,
        lastRateLimitAt: 0,
        lastRetryAfterMs: null,
        limiter: new Bottleneck({
            maxConcurrent: group === 'report-create' ? 1 : 2,
        }),
        nextStartAt: 0,
    };
    state.hydration = hydrateLimiterState(state);
    limiterStates.set(stateKey, state);
    return state;
}

async function hydrateLimiterState(state: LimiterState): Promise<void> {
    const stored = await loadRateLimitState(state.key);
    if (!stored) {
        return;
    }
    state.cooldownUntil = Math.max(state.cooldownUntil, stored.cooldownUntil);
    state.exhaustionCount = Math.max(state.exhaustionCount, stored.exhaustionCount);
    state.lastRateLimitAt = Math.max(state.lastRateLimitAt, stored.lastRateLimitAt);
    state.lastRetryAfterMs = stored.lastRetryAfterMs;
}

function normalizePriority(priority?: number): number {
    if (priority === undefined || !Number.isFinite(priority)) {
        return 5;
    }
    return Math.min(9, Math.max(0, Math.trunc(priority)));
}

function getFallbackRetryAfterMs(state: LimiterState): number {
    if (state.lastRetryAfterMs === null || Date.now() - state.lastRateLimitAt > 5 * 60 * 1000) {
        return 5000;
    }
    return Math.min(state.lastRetryAfterMs * 2, MAX_FALLBACK_RETRY_AFTER_MS);
}

function withJitter(delayMs: number): number {
    return Math.max(1, Math.round(delayMs * (0.8 + Math.random() * 0.4)));
}

async function waitForStartSlot(state: LimiterState): Promise<void> {
    while (true) {
        const now = Date.now();
        await resetStaleReportCreateExhaustions(state, now);
        const startAt = Math.max(now, state.nextStartAt, state.cooldownUntil);
        state.nextStartAt = startAt + DEFAULT_MIN_TIME;
        const waitMs = startAt - now;
        if (waitMs > 0) {
            await sleep(waitMs);
        }

        if (Date.now() >= state.cooldownUntil) {
            return;
        }
    }
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
 * Move the request start gate forward based on Retry-After.
 * The latest deadline wins, so overlapping 429s cannot shorten a cooldown.
 * @param retryAfterMs - Milliseconds to wait from Retry-After header
 */
async function applyCooldown(state: LimiterState, retryAfterMs: number): Promise<void> {
    const observedAt = Date.now();
    state.lastRateLimitAt = observedAt;
    const cooldownUntil = observedAt + retryAfterMs + DEFAULT_RETRY_AFTER_BUFFER_MS;
    if (cooldownUntil <= state.cooldownUntil) {
        await persistLimiterState(state);
        return;
    }

    state.lastRetryAfterMs = retryAfterMs;
    state.cooldownUntil = cooldownUntil;
    await persistLimiterState(state);
}

async function applyReportCreateExhaustionCooldown(state: LimiterState): Promise<number> {
    state.exhaustionCount = Math.min(state.exhaustionCount + 1, REPORT_CREATE_EXHAUSTION_BACKOFF_MS.length);
    const cooldownMs = REPORT_CREATE_EXHAUSTION_BACKOFF_MS[state.exhaustionCount - 1];
    const observedAt = Date.now();
    state.lastRateLimitAt = observedAt;
    state.lastRetryAfterMs = Math.max(state.lastRetryAfterMs ?? 0, cooldownMs);
    state.cooldownUntil = Math.max(state.cooldownUntil, observedAt + cooldownMs + DEFAULT_RETRY_AFTER_BUFFER_MS);
    await persistLimiterState(state);
    return cooldownMs;
}

async function applyReportCreateRecoveryCooldown(state: LimiterState, recoveredFromRateLimit: boolean): Promise<void> {
    if (state.exhaustionCount === 0 && !recoveredFromRateLimit) {
        return;
    }

    state.exhaustionCount = Math.max(0, state.exhaustionCount - 1);
    state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + REPORT_CREATE_RECOVERY_MIN_TIME_MS);
    await persistLimiterState(state);
}

async function resetStaleReportCreateExhaustions(state: LimiterState, now: number): Promise<void> {
    if (state.group !== 'report-create' || state.exhaustionCount === 0 || now - state.lastRateLimitAt < REPORT_CREATE_EXHAUSTION_RESET_MS) {
        return;
    }

    state.exhaustionCount = 0;
    await persistLimiterState(state);
}

const persistLimiterState = (state: LimiterState): Promise<void> =>
    saveRateLimitState(state.key, {
        cooldownUntil: state.cooldownUntil,
        exhaustionCount: state.exhaustionCount,
        lastRateLimitAt: state.lastRateLimitAt,
        lastRetryAfterMs: state.lastRetryAfterMs ?? 0,
    });
