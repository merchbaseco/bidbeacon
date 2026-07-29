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
            exhaustionCount: 0,
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
            throttle: { group: 'default', key: 'overlap-test' },
        });
        const secondPromise = throttledFetch('https://example.com/second', {
            throttle: { group: 'default', key: 'overlap-test' },
        });
        await vi.advanceTimersByTimeAsync(10_200);
        await Promise.all([firstPromise, secondPromise]);

        const thirdPromise = throttledFetch('https://example.com/third', {
            throttle: { group: 'default', key: 'overlap-test' },
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

        const lastState = vi.mocked(saveRateLimitState).mock.calls.at(-1)?.[1];
        expect(lastState?.lastRetryAfterMs).toBe(40_000);
    });

    it('opens a ten-minute report creation gate after retries exhaust 429s', async () => {
        const fetchMock = vi.mocked(global.fetch);
        const onMetrics = vi.fn();
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        vi.mocked(saveRateLimitState).mockClear();
        fetchMock.mockResolvedValue(new Response('<html>Too Many Requests</html>', { status: 429 }));

        const promise = throttledFetch('https://example.com/exhausted', {
            retry: AMAZON_ADS_API_RETRY,
            throttle: { group: 'report-create', key: 'exhausted-test' },
            onMetrics,
        });
        await vi.runAllTimersAsync();
        await expect(promise).resolves.toHaveProperty('status', 429);

        const lastState = vi.mocked(saveRateLimitState).mock.calls.at(-1)?.[1];
        expect(lastState).toMatchObject({ exhaustionCount: 1 });
        expect((lastState?.cooldownUntil ?? 0) - (lastState?.lastRateLimitAt ?? 0)).toBe(600_100);
        expect(onMetrics).toHaveBeenCalledWith(expect.objectContaining({ retryAfterMs: 600_000 }));
    });

    it('escalates exhausted report creation gates from ten to thirty minutes', async () => {
        const fetchMock = vi.mocked(global.fetch);
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        vi.mocked(saveRateLimitState).mockClear();
        fetchMock.mockResolvedValue(new Response('', { status: 429 }));

        for (const [index, expectedCooldownMs] of [600_000, 1_200_000, 1_800_000, 1_800_000].entries()) {
            const promise = throttledFetch(`https://example.com/exhausted-${index}`, {
                retry: AMAZON_ADS_API_RETRY,
                throttle: { group: 'report-create', key: 'escalation-test' },
            });
            await vi.runAllTimersAsync();
            await expect(promise).resolves.toHaveProperty('status', 429);

            const lastState = vi.mocked(saveRateLimitState).mock.calls.at(-1)?.[1];
            expect(lastState?.exhaustionCount).toBe(Math.min(index + 1, 3));
            expect((lastState?.cooldownUntil ?? 0) - (lastState?.lastRateLimitAt ?? 0)).toBe(expectedCooldownMs + 100);
        }
    });

    it('paces report creation for ten minutes after a recovery probe', async () => {
        const fetchMock = vi.mocked(global.fetch);
        const requestTimes: number[] = [];
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        fetchMock
            .mockImplementationOnce(async () => {
                requestTimes.push(Date.now());
                return new Response('', { status: 429 });
            })
            .mockImplementationOnce(async () => {
                requestTimes.push(Date.now());
                return new Response('', { status: 429 });
            })
            .mockImplementationOnce(async () => {
                requestTimes.push(Date.now());
                return new Response('', { status: 429 });
            })
            .mockImplementationOnce(async () => {
                requestTimes.push(Date.now());
                return new Response('ok', { status: 200 });
            })
            .mockImplementationOnce(async () => {
                requestTimes.push(Date.now());
                return new Response('ok', { status: 200 });
            });

        const exhausted = throttledFetch('https://example.com/exhausted', {
            retry: AMAZON_ADS_API_RETRY,
            throttle: { group: 'report-create', key: 'recovery-test' },
        });
        await vi.runAllTimersAsync();
        await expect(exhausted).resolves.toHaveProperty('status', 429);

        const recovered = throttledFetch('https://example.com/recovered', {
            retry: AMAZON_ADS_API_RETRY,
            throttle: { group: 'report-create', key: 'recovery-test' },
        });
        await vi.runAllTimersAsync();
        await expect(recovered).resolves.toHaveProperty('status', 200);

        const next = throttledFetch('https://example.com/next', {
            retry: AMAZON_ADS_API_RETRY,
            throttle: { group: 'report-create', key: 'recovery-test' },
        });
        await vi.runAllTimersAsync();
        await expect(next).resolves.toHaveProperty('status', 200);

        expect(requestTimes[3] - requestTimes[2]).toBe(600_100);
        expect(requestTimes[4] - requestTimes[3]).toBe(600_000);
    });

    it('continues report creation escalation after limiter startup', async () => {
        const fetchMock = vi.mocked(global.fetch);
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        vi.mocked(loadRateLimitState).mockResolvedValueOnce({
            cooldownUntil: Date.now() + 10_000,
            exhaustionCount: 2,
            lastRateLimitAt: Date.now(),
            lastRetryAfterMs: 60_000,
        });
        fetchMock.mockResolvedValue(new Response('', { status: 429 }));

        const promise = throttledFetch('https://example.com/persisted-exhaustion', {
            retry: AMAZON_ADS_API_RETRY,
            throttle: { group: 'report-create', key: 'persisted-exhaustion-test' },
        });
        await vi.runAllTimersAsync();
        await expect(promise).resolves.toHaveProperty('status', 429);

        const lastState = vi.mocked(saveRateLimitState).mock.calls.at(-1)?.[1];
        expect(lastState?.exhaustionCount).toBe(3);
        expect((lastState?.cooldownUntil ?? 0) - (lastState?.lastRateLimitAt ?? 0)).toBe(1_800_100);
    });

    it('runs only one report creation request per region at a time', async () => {
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

        releaseFirstRequest();
        await vi.advanceTimersByTimeAsync(500);
        await expect(Promise.all([first, second])).resolves.toHaveLength(2);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('clears stale report creation exhaustion after thirty inactive minutes', async () => {
        const fetchMock = vi.mocked(global.fetch);
        const requestTimes: number[] = [];
        vi.mocked(loadRateLimitState).mockResolvedValueOnce({
            cooldownUntil: Date.now() - 1,
            exhaustionCount: 3,
            lastRateLimitAt: Date.now() - 31 * 60_000,
            lastRetryAfterMs: 1_800_000,
        });
        fetchMock.mockImplementation(async () => {
            requestTimes.push(Date.now());
            return new Response('ok', { status: 200 });
        });

        const first = throttledFetch('https://example.com/after-quiet-period', {
            throttle: { group: 'report-create', key: 'stale-exhaustion-test' },
        });
        await vi.runAllTimersAsync();
        await expect(first).resolves.toHaveProperty('status', 200);

        const second = throttledFetch('https://example.com/normal-pacing', {
            throttle: { group: 'report-create', key: 'stale-exhaustion-test' },
        });
        await vi.runAllTimersAsync();
        await expect(second).resolves.toHaveProperty('status', 200);

        expect(requestTimes[1] - requestTimes[0]).toBe(500);
        expect(vi.mocked(saveRateLimitState).mock.calls.at(-1)?.[1].exhaustionCount).toBe(0);
    });
});
