import { createServer } from 'node:http';
import type { RankWranglerClient } from '@rankwrangler/http-client';
import { describe, expect, it, vi } from 'vitest';
import { createRankWranglerProductResolver } from './product-resolver';

describe('RankWrangler Product resolver', () => {
    it('uses one bulk request and returns only available titled Products', async () => {
        const mutate = vi.fn().mockResolvedValue([
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B000000001',
                amazonListingStatus: 'active',
                title: 'First shirt',
                thumbnail: { status: 'unavailable' },
            },
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B000000002',
                amazonListingStatus: 'active',
                title: null,
                thumbnail: { status: 'unavailable' },
            },
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B000000003',
                amazonListingStatus: 'deleted',
                title: 'Archived shirt',
                thumbnail: { status: 'unavailable' },
            },
        ]);
        const createClient = vi.fn(
            () =>
                ({
                    product: { getMany: { mutate } },
                }) as unknown as RankWranglerClient
        );
        const resolver = createRankWranglerProductResolver({ merchbaseUserId: 'mbu_one', clientId: 'bb', clientSecret: 's'.repeat(32), baseUrl: 'https://rankwrangler.test', createClient });

        await expect(
            resolver.resolveProducts({
                marketplaceId: 'ATVPDKIKX0DER',
                asins: ['B000000001', 'B000000002', 'B000000003'],
            })
        ).resolves.toEqual([
            { asin: 'B000000001', title: 'First shirt' },
            { asin: 'B000000003', title: 'Archived shirt' },
        ]);
        expect(createClient).toHaveBeenCalledWith({
            baseUrl: 'https://rankwrangler.test',
            batch: false,
            headers: { 'CF-Access-Client-Id': 'bb', 'CF-Access-Client-Secret': 's'.repeat(32), 'x-merchbase-user-id': 'mbu_one' },
        });
        expect(mutate).toHaveBeenCalledWith({
            products: [
                { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000001' },
                { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000002' },
                { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000003' },
            ],
        });
    });
    it('uses only the internal native-header HTTP mutation and refuses redirects', async () => {
        let redirect = false;
        const requests: string[] = [];
        const server = createServer((request, response) => {
            requests.push(`${request.method} ${request.url}`);
            expect(request.headers['cf-access-client-id']).toBe('bb-client');
            expect(request.headers['cf-access-client-secret']).toBe('S'.repeat(32));
            expect(request.headers['x-merchbase-user-id']).toBe('mbu_one');
            expect(request.headers.authorization).toBeUndefined();
            expect(request.headers['cf-access-jwt-assertion']).toBeUndefined();
            if (redirect) {
                response.writeHead(302, { location: '/capture' });
                response.end();
                return;
            }
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({ result: { data: [{ asin: 'B000000001', title: 'First shirt' }] } }));
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const address = server.address();
            if (!address || typeof address === 'string') {
                throw new Error('Missing internal peer port');
            }
            const resolver = createRankWranglerProductResolver({ baseUrl: `http://127.0.0.1:${address.port}`, merchbaseUserId: 'mbu_one', clientId: 'bb-client', clientSecret: 'S'.repeat(32) });
            const input = { marketplaceId: 'ATVPDKIKX0DER', asins: ['B000000001'] };
            await expect(resolver.resolveProducts(input)).resolves.toEqual([{ asin: 'B000000001', title: 'First shirt' }]);
            redirect = true;
            await expect(resolver.resolveProducts(input)).rejects.toThrow();
            expect(requests).toEqual(['POST /api/api.public.product.getMany', 'POST /api/api.public.product.getMany']);
        } finally {
            await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
        }
    });
});
