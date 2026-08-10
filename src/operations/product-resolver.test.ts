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
        const resolver = createRankWranglerProductResolver({ accessCredential: 'oat_test', baseUrl: 'https://rankwrangler.test', createClient });

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
            headers: { Authorization: 'Bearer oat_test' },
        });
        expect(mutate).toHaveBeenCalledWith({
            products: [
                { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000001' },
                { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000002' },
                { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000003' },
            ],
        });
    });
});
