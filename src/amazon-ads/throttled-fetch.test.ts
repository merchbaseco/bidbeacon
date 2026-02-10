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
});
