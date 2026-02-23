import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AMAZON_ADS_API_RETRY, throttledFetch } from './throttled-fetch';

describe('throttledFetch retries', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('retries retryable responses with backoff and eventually succeeds', async () => {
        const fetchMock = vi.mocked(global.fetch);

        fetchMock
            .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '1' } }))
            .mockResolvedValueOnce(new Response('', { status: 503 }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const promise = throttledFetch('https://example.com', {
            method: 'POST',
            retry: AMAZON_ADS_API_RETRY,
        });

        await vi.runAllTimersAsync();
        const response = await promise;

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(3);
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
});
