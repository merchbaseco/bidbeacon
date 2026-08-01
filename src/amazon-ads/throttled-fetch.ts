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
    amazonRetryAfterMs: number | null;
    attemptCount: number;
    governorCooldownMs: number | null;
    queueWaitMs: number;
    rateLimitCount: number;
    rateLimitRequestId: string | null;
    rateLimitResponseContentType: string | null;
    rateLimitResponseServer: string | null;
    retryCount: number;
};

const DEFAULT_RETRYABLE_STATUS_CODES = [408, 409, 429, 500, 502, 503, 504];
const REPORT_CREATE_RETRYABLE_STATUS_CODES = DEFAULT_RETRYABLE_STATUS_CODES.filter(status => status !== 429);
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

export const AMAZON_ADS_REPORT_CREATE_RETRY: RetryOptions = {
    ...AMAZON_ADS_API_RETRY,
    retryableStatusCodes: REPORT_CREATE_RETRYABLE_STATUS_CODES,
};

const DEFAULT_MIN_TIME = 500;
const MAX_FALLBACK_RETRY_AFTER_MS = 60_000;
const REPORT_CREATE_MIN_TIME_MS = 5 * 60_000;
const REPORT_CREATE_FALLBACK_COOLDOWN_MS = 60 * 60_000;

type LimiterState = {
    cooldownUntil: number;
    group: 'default' | 'report-create';
    hydration: Promise<void>;
    key: string;
    lastRateLimitAt: number;
    lastGovernorCooldownMs: number | null;
    limiter: Bottleneck;
    nextStartAt: number;
};

class GovernorDeferredError extends Error {
    readonly governorRetryAt: number;

    constructor(governorRetryAt: number) {
        super(`Amazon Ads request deferred by the local governor until ${new Date(governorRetryAt).toISOString()}.`);
        this.name = 'GovernorDeferredError';
        this.governorRetryAt = governorRetryAt;
    }
}

export type ThrottledResponse = Response & {
    governorRetryAt?: number;
};

const limiterStates = new Map<string, LimiterState>();

/**
 * Throttled fetch wrapper that respects rate limits and Retry-After headers.
 * Compatible with native fetch API.
 * @param url - Request URL
 * @param options - Fetch options (same as native fetch)
 * @returns Promise resolving to Response
 */
export async function throttledFetch(url: string | URL | Request, options?: ThrottledFetchOptions): Promise<ThrottledResponse> {
    const { retry, timeoutMs, throttle, onMetrics, ...fetchOptions } = options ?? {};
    const throttleGroup = throttle?.group ?? 'default';
    const resolvedRetry = retry ? normalizeRetryOptions(retry) : null;
    const resolvedTimeoutMs = normalizeTimeoutMs(timeoutMs);
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const method = fetchOptions.method || 'GET';
    const limiterState = getLimiterState(throttleGroup, throttle?.key ?? 'global');
    const priority = normalizePriority(throttle?.priority);
    const metrics: ThrottledFetchMetrics = {
        amazonRetryAfterMs: null,
        attemptCount: 0,
        governorCooldownMs: null,
        queueWaitMs: 0,
        rateLimitCount: 0,
        rateLimitRequestId: null,
        rateLimitResponseContentType: null,
        rateLimitResponseServer: null,
        retryCount: 0,
    };

    let attempt = 1;
    let lastNetworkError: Error | null = null;

    try {
        while (attempt <= (resolvedRetry?.attempts ?? 1)) {
            try {
                const queuedAt = performance.now();
                const response = await limiterState.limiter.schedule({ priority }, async () => {
                    await limiterState.hydration;
                    await waitForStartSlot(limiterState, attempt === 1);
                    metrics.queueWaitMs += Math.round(performance.now() - queuedAt);
                    metrics.attemptCount = attempt;
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
                    const cooldownMs = retryAfterMs ?? withJitter(throttleGroup === 'report-create' ? REPORT_CREATE_FALLBACK_COOLDOWN_MS : getFallbackRetryAfterMs(limiterState));
                    const effectiveCooldownMs = throttleGroup === 'report-create' ? Math.max(cooldownMs, REPORT_CREATE_MIN_TIME_MS) : cooldownMs;
                    metrics.amazonRetryAfterMs = retryAfterMs === null ? metrics.amazonRetryAfterMs : Math.max(metrics.amazonRetryAfterMs ?? 0, retryAfterMs);
                    metrics.governorCooldownMs = Math.max(metrics.governorCooldownMs ?? 0, effectiveCooldownMs);
                    metrics.rateLimitRequestId = getRequestId(response.headers) ?? metrics.rateLimitRequestId;
                    metrics.rateLimitResponseContentType = response.headers.get('Content-Type') ?? metrics.rateLimitResponseContentType;
                    metrics.rateLimitResponseServer = response.headers.get('Server') ?? metrics.rateLimitResponseServer;
                    await applyCooldown(limiterState, effectiveCooldownMs);
                    (response as ThrottledResponse).governorRetryAt = limiterState.cooldownUntil;
                } else if (response.ok && throttleGroup === 'report-create') {
                    await persistReportCreatePacing(limiterState);
                }

                if (!(shouldRetry && resolvedRetry)) {
                    return response as ThrottledResponse;
                }

                metrics.retryCount += 1;
                await drainResponseBody(response);
                const retryDelayMs = getRetryDelayMs(response.headers, resolvedRetry, attempt);
                if (retryDelayMs > 0) {
                    await sleep(retryDelayMs);
                }
            } catch (error) {
                if (error instanceof GovernorDeferredError) {
                    metrics.governorCooldownMs = Math.max(metrics.governorCooldownMs ?? 0, error.governorRetryAt - Date.now());
                    throw error;
                }
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
        group,
        hydration: Promise.resolve(),
        key: stateKey,
        lastRateLimitAt: 0,
        lastGovernorCooldownMs: null,
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
    state.lastRateLimitAt = Math.max(state.lastRateLimitAt, stored.lastRateLimitAt);
    state.lastGovernorCooldownMs = stored.lastGovernorCooldownMs;
}

function normalizePriority(priority?: number): number {
    if (priority === undefined || !Number.isFinite(priority)) {
        return 5;
    }
    return Math.min(9, Math.max(0, Math.trunc(priority)));
}

function getFallbackRetryAfterMs(state: LimiterState): number {
    if (state.lastGovernorCooldownMs === null || Date.now() - state.lastRateLimitAt > 5 * 60 * 1000) {
        return 5000;
    }
    return Math.min(state.lastGovernorCooldownMs * 2, MAX_FALLBACK_RETRY_AFTER_MS);
}

function withJitter(delayMs: number): number {
    return Math.max(1, Math.round(delayMs * (0.8 + Math.random() * 0.4)));
}

async function waitForStartSlot(state: LimiterState, applyReportPacing: boolean): Promise<void> {
    if (state.group === 'report-create' && !applyReportPacing) {
        return;
    }

    while (true) {
        const now = Date.now();
        const startAt = Math.max(now, state.nextStartAt, state.cooldownUntil);
        const waitMs = startAt - now;
        if (state.group === 'report-create' && waitMs > 0) {
            throw new GovernorDeferredError(startAt);
        }

        state.nextStartAt = startAt + (state.group === 'report-create' ? REPORT_CREATE_MIN_TIME_MS : DEFAULT_MIN_TIME);
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

    state.lastGovernorCooldownMs = retryAfterMs;
    state.cooldownUntil = cooldownUntil;
    await persistLimiterState(state);
}

const persistReportCreatePacing = async (state: LimiterState): Promise<void> => {
    state.cooldownUntil = Math.max(state.cooldownUntil, state.nextStartAt);
    await persistLimiterState(state);
};

const persistLimiterState = (state: LimiterState): Promise<void> =>
    saveRateLimitState(state.key, {
        cooldownUntil: state.cooldownUntil,
        lastRateLimitAt: state.lastRateLimitAt,
        lastGovernorCooldownMs: state.lastGovernorCooldownMs ?? 0,
    });

const getRequestId = (headers: Headers): string | null => headers.get('Amazon-Advertising-API-Request-Id') ?? headers.get('x-amzn-requestid') ?? headers.get('x-amz-request-id');
