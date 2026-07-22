import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./rate-limit-store', () => ({
    loadRateLimitState: vi.fn().mockResolvedValue(null),
    saveRateLimitState: vi.fn().mockResolvedValue(undefined),
}));

import { loadRateLimitState, saveRateLimitState } from './rate-limit-store';
import { AMAZON_ADS_API_RETRY, throttledFetch } from './throttled-fetch';

describe('throttledFetch retries', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', vi.fn());
        vi.mocked(loadRateLimitState).mockResolvedValue(null);
        vi.mocked(saveRateLimitState).mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('retries retryable responses with backoff and eventually succeeds', async () => {
        const fetchMock = vi.mocked(global.fetch);
        const onMetrics = vi.fn();

        fetchMock
            .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '1' } }))
            .mockResolvedValueOnce(new Response('', { status: 503 }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const promise = throttledFetch('https://example.com', {
            method: 'POST',
            retry: AMAZON_ADS_API_RETRY,
            throttle: { group: 'report-create', key: 'metrics-test' },
            onMetrics,
        });

        await vi.runAllTimersAsync();
        const response = await promise;

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(onMetrics).toHaveBeenCalledWith({
            attemptCount: 3,
            queueWaitMs: expect.any(Number),
            rateLimitCount: 1,
            retryAfterMs: 1000,
            retryCount: 2,
        });
    });

    it('creates a fresh timeout signal for each retry attempt', async () => {
        const fetchMock = vi.mocked(global.fetch);
        const attemptSignals: AbortSignal[] = [];

        fetchMock.mockImplementation(async (_url, options) => {
            const signal = options?.signal as AbortSignal;
            attemptSignals.push(signal);

            return await new Promise<Response>((resolve, reject) => {
                signal.addEventListener(
                    'abort',
                    () => {
                        reject(signal.reason ?? new Error('aborted'));
                    },
                    { once: true }
                );
            });
        });

        const promise = throttledFetch('https://example.com', {
            method: 'POST',
            retry: AMAZON_ADS_API_RETRY,
            timeoutMs: 30_000,
        });

        const rejection = expect(promise).rejects.toThrow('Network error during POST https://example.com');
        await vi.runAllTimersAsync();
        await rejection;

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(attemptSignals).toHaveLength(3);
        expect(new Set(attemptSignals).size).toBe(3);
        expect(attemptSignals.every(signal => signal.aborted)).toBe(true);
    });

    it('keeps report cooldowns isolated from ordinary API calls', async () => {
        const fetchMock = vi.mocked(global.fetch);
        fetchMock.mockImplementation(async url => {
            if (String(url).includes('report')) {
                return new Response('', { status: 429, headers: { 'Retry-After': '30' } });
            }
            return new Response('ok', { status: 200 });
        });

        const reportPromise = throttledFetch('https://example.com/report', {
            throttle: { group: 'report-create', key: 'isolation-test' },
        });
        await vi.advanceTimersByTimeAsync(10);
        const reportResponse = await reportPromise;

        const ordinaryPromise = throttledFetch('https://example.com/campaigns', {
            throttle: { group: 'default', key: 'isolation-test' },
        });
        await vi.advanceTimersByTimeAsync(10);
        const ordinaryResponse = await ordinaryPromise;

        expect(reportResponse.status).toBe(429);
        expect(ordinaryResponse.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('honors a persisted cooldown after limiter startup', async () => {
        const fetchMock = vi.mocked(global.fetch).mockResolvedValue(new Response('ok', { status: 200 }));
        vi.mocked(loadRateLimitState).mockResolvedValueOnce({
            cooldownUntil: Date.now() + 10_000,
            lastRateLimitAt: Date.now(),
            lastRetryAfterMs: 10_000,
        });

        const promise = throttledFetch('https://example.com/persisted', {
            throttle: { group: 'report-create', key: 'persisted-test' },
        });
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(9999);
        expect(fetchMock).not.toHaveBeenCalled();

        await vi.runAllTimersAsync();
        await expect(promise).resolves.toHaveProperty('status', 200);
    });

    it('does not let an older cooldown reset a newer deadline', async () => {
        const fetchMock = vi.mocked(global.fetch);
        fetchMock
            .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '10' } }))
            .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '20' } }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const firstPromise = throttledFetch('https://example.com/first', {
            throttle: { group: 'report-create', key: 'overlap-test' },
        });
        const secondPromise = throttledFetch('https://example.com/second', {
            throttle: { group: 'report-create', key: 'overlap-test' },
        });
        await vi.advanceTimersByTimeAsync(10_200);
        await Promise.all([firstPromise, secondPromise]);

        const thirdPromise = throttledFetch('https://example.com/third', {
            throttle: { group: 'report-create', key: 'overlap-test' },
        });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(11_000);
        const thirdResponse = await thirdPromise;
        expect(thirdResponse.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('retains a learned fallback through an intermittent success', async () => {
        const fetchMock = vi.mocked(global.fetch);
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        vi.mocked(saveRateLimitState).mockClear();
        fetchMock
            .mockResolvedValueOnce(new Response('<html>Too Many Requests</html>', { status: 429 }))
            .mockResolvedValueOnce(new Response('<html>Too Many Requests</html>', { status: 429 }))
            .mockResolvedValueOnce(new Response('<html>Too Many Requests</html>', { status: 429 }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }))
            .mockResolvedValueOnce(new Response('<html>Too Many Requests</html>', { status: 429 }));

        const throttled = throttledFetch('https://example.com/throttled', {
            retry: AMAZON_ADS_API_RETRY,
            throttle: { group: 'report-create', key: 'intermittent-success-test' },
        });
        await vi.runAllTimersAsync();
        await expect(throttled).resolves.toHaveProperty('status', 429);

        const recovered = throttledFetch('https://example.com/recovered', {
            throttle: { group: 'report-create', key: 'intermittent-success-test' },
        });
        await vi.runAllTimersAsync();
        await expect(recovered).resolves.toHaveProperty('status', 200);

        const throttledAgain = throttledFetch('https://example.com/throttled-again', {
            throttle: { group: 'report-create', key: 'intermittent-success-test' },
        });
        await vi.runAllTimersAsync();
        await expect(throttledAgain).resolves.toHaveProperty('status', 429);

        const lastState = vi.mocked(saveRateLimitState).mock.calls.at(-1)?.[1];
        expect(lastState?.lastRetryAfterMs).toBe(40_000);
    });
});
