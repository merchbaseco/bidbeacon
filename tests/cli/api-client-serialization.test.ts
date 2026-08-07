import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createBidBeaconClient, type RouterInputs } from '../../packages/bidbeacon-api-client/src';

const accountId = '00000000-0000-4000-8000-000000000001';

describe('canonical typed client HTTP serialization', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('retains the shared Search resource and Field vocabulary in generated inputs', () => {
        expectTypeOf<RouterInputs['search']['resource']>().toEqualTypeOf<'campaign' | 'ad_group' | 'ad' | 'target' | 'product' | 'change_event'>();
        expectTypeOf<NonNullable<RouterInputs['search']['fields']>[number]>().not.toEqualTypeOf<string>();
        expectTypeOf<NonNullable<RouterInputs['search']['filters']>[number]['field']>().not.toEqualTypeOf<string>();
        expectTypeOf<NonNullable<RouterInputs['search']['orderBy']>[number]['field']>().not.toEqualTypeOf<string>();
    });

    it('serializes operation names and inferred inputs without legacy wrappers', async () => {
        const requests: Array<{ url: string; init?: RequestInit }> = [];
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            requests.push({ url: input instanceof Request ? input.url : String(input), init });
            const output = requests.at(-1)?.url.endsWith('/search')
                ? {
                      context: { account: { id: accountId, timezone: 'UTC', currency: 'USD' }, resource: 'campaign', fields: ['campaign.id'], orderBy: [{ field: 'campaign.id', direction: 'asc' }] },
                      rows: [],
                  }
                : {
                      id: 'target-1',
                      campaignId: 'campaign-1',
                      adGroupId: 'ad-group-1',
                      state: 'PAUSED',
                      deliveryStatus: 'DELIVERING',
                      type: 'KEYWORD',
                      negative: false,
                      bid: 1,
                  };
            return Response.json({ result: { data: output } });
        }) as typeof fetch;

        const client = createBidBeaconClient({ baseUrl: 'https://bidbeacon.merchbase.co', credential: 'ak_test', batch: false });
        await client.search.query({ accountId, resource: 'campaign', fields: ['campaign.id'], limit: 10 });
        await client.update_target.mutate({ accountId, targetId: 'target-1', changes: { bid: 1 } });

        expect(requests).toHaveLength(2);
        const searchUrl = new URL(requests[0]!.url);
        expect(searchUrl.pathname).toBe('/api/search');
        expect(JSON.parse(searchUrl.searchParams.get('input') ?? '{}')).toEqual({
            accountId,
            resource: 'campaign',
            fields: ['campaign.id'],
            limit: 10,
        });
        expect(requests[0]!.init?.headers).toMatchObject({ Authorization: 'Bearer ak_test' });

        expect(new URL(requests[1]!.url).pathname).toBe('/api/update_target');
        expect(JSON.parse(String(requests[1]!.init?.body))).toEqual({ accountId, targetId: 'target-1', changes: { bid: 1 } });
    });
});
