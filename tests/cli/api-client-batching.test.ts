import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBidBeaconClient } from '../../packages/bidbeacon-api-client/src/index';

const getRequestUrl = (request: RequestInfo | URL) => {
    if (typeof request === 'string') {
        return request;
    }
    if (request instanceof URL) {
        return request.toString();
    }
    return request.url;
};

const singleResultBody = JSON.stringify({ result: { data: { accounts: [] } } });
const batchResultBody = JSON.stringify([{ result: { data: { accounts: [] } } }, { result: { data: { accounts: [] } } }]);

describe('api client batching defaults', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('batches concurrent queries by default', async () => {
        const urls: string[] = [];
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = getRequestUrl(input);
            urls.push(url);
            return new Response(url.includes('batch=1') ? batchResultBody : singleResultBody, {
                headers: { 'content-type': 'application/json' },
            });
        }) as typeof fetch;

        const client = createBidBeaconClient({
            baseUrl: 'https://bidbeacon.merchbase.co',
            credential: 'ak_test',
        });

        await Promise.all([client.list_advertiser_accounts.query({}), client.list_advertiser_accounts.query({})]);

        expect(urls).toHaveLength(1);
        expect(urls[0]).toContain('/api/list_advertiser_accounts,list_advertiser_accounts');
        expect(urls[0]).toContain('batch=1');
    });

    it('does not batch concurrent queries when explicitly disabled', async () => {
        const urls: string[] = [];
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = getRequestUrl(input);
            urls.push(url);
            return new Response(singleResultBody, {
                headers: { 'content-type': 'application/json' },
            });
        }) as typeof fetch;

        const client = createBidBeaconClient({
            baseUrl: 'https://bidbeacon.merchbase.co',
            credential: 'ak_test',
            batch: false,
        });

        await Promise.all([client.list_advertiser_accounts.query({}), client.list_advertiser_accounts.query({})]);

        expect(urls).toHaveLength(2);
        expect(urls.every(url => url.includes('/api/list_advertiser_accounts'))).toBe(true);
        expect(urls.some(url => url.includes('batch=1'))).toBe(false);
    });

    it('splits batched queries to stay under batchMaxURLLength', async () => {
        const urls: string[] = [];
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = getRequestUrl(input);
            urls.push(url);
            const parsed = new URL(url);
            const procedures = parsed.pathname.replace('/api/', '');
            const operationCount = procedures.length === 0 ? 1 : procedures.split(',').length;
            const responseBody = JSON.stringify(Array.from({ length: operationCount }, () => ({ result: { data: { items: [] } } })));
            return new Response(responseBody, {
                headers: { 'content-type': 'application/json' },
            });
        }) as typeof fetch;

        const client = createBidBeaconClient({
            baseUrl: 'https://bidbeacon.merchbase.co',
            credential: 'ak_test',
            batch: true,
            batchMaxURLLength: 2000,
            batchMaxItems: 50,
        });

        await Promise.all(Array.from({ length: 120 }, () => client.list_advertiser_accounts.query({})));

        expect(urls.length).toBeGreaterThan(1);
        expect(urls.every(url => url.length <= 2000)).toBe(true);
    });
});
