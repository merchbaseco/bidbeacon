import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./rate-limit-store', () => ({
    loadRateLimitState: vi.fn().mockResolvedValue(null),
    saveRateLimitState: vi.fn().mockResolvedValue(undefined),
}));

import { loadRateLimitState, saveRateLimitState } from './rate-limit-store';
import { AMAZON_ADS_API_RETRY, AMAZON_ADS_REPORT_CREATE_RETRY, throttledFetch } from './throttled-fetch';

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

    it('retries ordinary retryable responses with backoff and records attempt metrics', async () => {
        const fetchMock = vi.mocked(global.fetch);
        const onMetrics = vi.fn();

        fetchMock
            .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '1' } }))
            .mockResolvedValueOnce(new Response('', { status: 503 }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const promise = throttledFetch('https://example.com', {
            method: 'POST',
            retry: AMAZON_ADS_API_RETRY,
            onMetrics,
        });

        await vi.runAllTimersAsync();
        await expect(promise).resolves.toHaveProperty('status', 200);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(onMetrics).toHaveBeenCalledWith(
            expect.objectContaining({
                amazonRetryAfterMs: 1000,
                attemptCount: 3,
                governorCooldownMs: 1000,
                rateLimitCount: 1,
                rateLimitRequestId: null,
                rateLimitResponseContentType: 'text/plain;charset=UTF-8',
                rateLimitResponseServer: null,
                retryCount: 2,
            })
        );
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

    it('does not retry a report creation 429 and opens an hour-scale regional circuit', async () => {
        const fetchMock = vi.mocked(global.fetch);
        const onMetrics = vi.fn();
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        fetchMock.mockResolvedValue(
            new Response('<html>Too Many Requests</html>', {
                status: 429,
                headers: {
                    'Amazon-Advertising-API-Request-Id': 'request-123',
                    'Content-Type': 'text/html',
                    Server: 'openresty',
                },
            })
        );

        const promise = throttledFetch('https://example.com/report', {
            retry: AMAZON_ADS_REPORT_CREATE_RETRY,
            throttle: { group: 'report-create', key: 'report-circuit-test' },
            onMetrics,
        });

        await vi.runAllTimersAsync();
        const response = await promise;

        expect(response.status).toBe(429);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(response.governorRetryAt).toBe(Date.now() + 3_600_100);
        expect(onMetrics).toHaveBeenCalledWith({
            amazonRetryAfterMs: null,
            attemptCount: 1,
            governorCooldownMs: 3_600_000,
            queueWaitMs: expect.any(Number),
            rateLimitCount: 1,
            rateLimitRequestId: 'request-123',
            rateLimitResponseContentType: 'text/html',
            rateLimitResponseServer: 'openresty',
            retryCount: 0,
        });
        expect(vi.mocked(saveRateLimitState).mock.calls.at(-1)?.[1]).toMatchObject({
            lastGovernorCooldownMs: 3_600_000,
        });
    });

    it('honors Amazon Retry-After exactly before using the report fallback', async () => {
        const fetchMock = vi.mocked(global.fetch);
        const onMetrics = vi.fn();
        fetchMock.mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '120' } }));

        const promise = throttledFetch('https://example.com/report-with-header', {
            retry: AMAZON_ADS_REPORT_CREATE_RETRY,
            throttle: { group: 'report-create', key: 'report-header-test' },
            onMetrics,
        });

        await vi.runAllTimersAsync();
        const response = await promise;

        expect(response.governorRetryAt).toBe(Date.now() + 300_100);
        expect(onMetrics).toHaveBeenCalledWith(
            expect.objectContaining({
                amazonRetryAfterMs: 120_000,
                governorCooldownMs: 300_000,
                rateLimitCount: 1,
            })
        );
    });

    it('still retries report creation server errors', async () => {
        const fetchMock = vi.mocked(global.fetch);
        fetchMock.mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const promise = throttledFetch('https://example.com/report-server-error', {
            retry: AMAZON_ADS_REPORT_CREATE_RETRY,
            throttle: { group: 'report-create', key: 'report-server-error-test' },
        });

        await vi.runAllTimersAsync();
        await expect(promise).resolves.toHaveProperty('status', 200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('keeps report cooldowns isolated from ordinary API calls', async () => {
        const fetchMock = vi.mocked(global.fetch);
        fetchMock.mockImplementation(async url => {
            if (String(url).includes('report')) {
                return new Response('', { status: 429 });
            }
            return new Response('ok', { status: 200 });
        });

        const reportPromise = throttledFetch('https://example.com/report', {
            throttle: { group: 'report-create', key: 'isolation-test' },
        });
        await vi.advanceTimersByTimeAsync(10);
        await expect(reportPromise).resolves.toHaveProperty('status', 429);

        const ordinaryPromise = throttledFetch('https://example.com/campaigns', {
            throttle: { group: 'default', key: 'isolation-test' },
        });
        await vi.advanceTimersByTimeAsync(10);
        await expect(ordinaryPromise).resolves.toHaveProperty('status', 200);

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('defers immediately when a persisted report cooldown is active', async () => {
        const fetchMock = vi.mocked(global.fetch).mockResolvedValue(new Response('ok', { status: 200 }));
        const onMetrics = vi.fn();
        const governorRetryAt = Date.now() + 10_000;
        vi.mocked(loadRateLimitState).mockResolvedValueOnce({
            cooldownUntil: governorRetryAt,
            lastGovernorCooldownMs: 3_600_000,
            lastRateLimitAt: Date.now(),
        });

        const promise = throttledFetch('https://example.com/persisted', {
            throttle: { group: 'report-create', key: 'persisted-test' },
            onMetrics,
        });
        const rejection = expect(promise).rejects.toMatchObject({ governorRetryAt });

        await vi.runAllTimersAsync();
        await rejection;
        expect(fetchMock).not.toHaveBeenCalled();
        expect(onMetrics).toHaveBeenCalledWith(expect.objectContaining({ attemptCount: 0, governorCooldownMs: 10_000, rateLimitCount: 0 }));
    });

    it('persists five-minute pacing and defers another logical report instead of sleeping', async () => {
        const fetchMock = vi.mocked(global.fetch);
        const requestTimes: number[] = [];
        fetchMock.mockImplementation(async () => {
            requestTimes.push(Date.now());
            return new Response('ok', { status: 200 });
        });

        const first = throttledFetch('https://example.com/first-report', {
            throttle: { group: 'report-create', key: 'pacing-test' },
        });
        await vi.runAllTimersAsync();
        await expect(first).resolves.toHaveProperty('status', 200);

        const second = throttledFetch('https://example.com/second-report', {
            throttle: { group: 'report-create', key: 'pacing-test' },
        });
        const rejection = expect(second).rejects.toMatchObject({ governorRetryAt: requestTimes[0] + 300_000 });
        await vi.runAllTimersAsync();
        await rejection;

        await vi.advanceTimersByTimeAsync(300_000);
        const third = throttledFetch('https://example.com/third-report', {
            throttle: { group: 'report-create', key: 'pacing-test' },
        });
        await vi.runAllTimersAsync();
        await expect(third).resolves.toHaveProperty('status', 200);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(requestTimes[1] - requestTimes[0]).toBe(300_000);
        expect(vi.mocked(saveRateLimitState).mock.calls.at(-1)?.[1].cooldownUntil).toBe(requestTimes[1] + 300_000);
    });

    it('defers a queued regional report after the active request succeeds', async () => {
        const fetchMock = vi.mocked(global.fetch);
        let releaseFirstRequest: () => void = () => undefined;
        fetchMock
            .mockImplementationOnce(
                async () =>
                    await new Promise<Response>(resolve => {
                        releaseFirstRequest = () => resolve(new Response('ok', { status: 200 }));
                    })
            )
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const first = throttledFetch('https://example.com/first', {
            throttle: { group: 'report-create', key: 'single-flight-test' },
        });
        const second = throttledFetch('https://example.com/second', {
            throttle: { group: 'report-create', key: 'single-flight-test' },
        });
        await vi.advanceTimersByTimeAsync(10);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const firstResolution = expect(first).resolves.toHaveProperty('status', 200);
        const rejection = expect(second).rejects.toMatchObject({ name: 'GovernorDeferredError' });
        releaseFirstRequest();
        await vi.runAllTimersAsync();
        await firstResolution;
        await rejection;
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retains the ordinary learned fallback through an intermittent success', async () => {
        const fetchMock = vi.mocked(global.fetch);
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        fetchMock
            .mockResolvedValueOnce(new Response('', { status: 429 }))
            .mockResolvedValueOnce(new Response('', { status: 429 }))
            .mockResolvedValueOnce(new Response('', { status: 429 }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }))
            .mockResolvedValueOnce(new Response('', { status: 429 }));

        const throttled = throttledFetch('https://example.com/throttled', {
            retry: AMAZON_ADS_API_RETRY,
            throttle: { group: 'default', key: 'intermittent-success-test' },
        });
        await vi.runAllTimersAsync();
        await expect(throttled).resolves.toHaveProperty('status', 429);

        const recovered = throttledFetch('https://example.com/recovered', {
            throttle: { group: 'default', key: 'intermittent-success-test' },
        });
        await vi.runAllTimersAsync();
        await expect(recovered).resolves.toHaveProperty('status', 200);

        const throttledAgain = throttledFetch('https://example.com/throttled-again', {
            throttle: { group: 'default', key: 'intermittent-success-test' },
        });
        await vi.runAllTimersAsync();
        await expect(throttledAgain).resolves.toHaveProperty('status', 429);

        expect(vi.mocked(saveRateLimitState).mock.calls.at(-1)?.[1].lastGovernorCooldownMs).toBe(40_000);
    });
});
