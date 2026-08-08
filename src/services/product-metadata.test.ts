import { describe, expect, it, vi } from 'vitest';
import { buildProductMetadataEvent, fetchProductMetadataBatches } from './product-metadata-batches';

describe('fetchProductMetadataBatches', () => {
    it.each([
        { count: 300, calls: 2, batchSizes: [1, 299] },
        { count: 301, calls: 2, batchSizes: [1, 300] },
    ])('fetches $count ASINs in $calls Amazon requests', async ({ count, calls, batchSizes }) => {
        const fetchBatch = vi.fn(async (asins: string[]) => asins.map(asin => ({ asin, title: asin })));
        const asins = Array.from({ length: count }, (_, index) => `B${String(index).padStart(9, '0')}`);

        const result = await fetchProductMetadataBatches({ asins, fetchBatch });

        expect(fetchBatch).toHaveBeenCalledTimes(calls);
        expect(result.batchSizes).toEqual(batchSizes);
        expect(result.products).toHaveLength(count);
    });

    it('ignores unsolicited products and deduplicates Amazon results', async () => {
        const result = await fetchProductMetadataBatches({
            asins: ['B000000001'],
            fetchBatch: async () => [
                { asin: 'B000000001', title: 'Old' },
                { asin: 'B000000001', title: 'Current' },
                { asin: 'BUNREQUESTED', title: 'Nope' },
            ],
        });

        expect(result.products).toEqual([{ asin: 'B000000001', title: 'Current' }]);
    });

    it('persists a successful batch before a later Amazon batch fails', async () => {
        let persistedCount = 0;
        let call = 0;
        await expect(
            fetchProductMetadataBatches({
                asins: Array.from({ length: 301 }, (_, index) => `B${String(index).padStart(9, '0')}`),
                fetchBatch: async asins => {
                    call++;
                    if (call === 2) {
                        throw new Error('Amazon unavailable');
                    }
                    return asins.map(asin => ({ asin, title: asin }));
                },
                onBatch: async (_batchAsins, products) => {
                    persistedCount += products.length;
                },
            })
        ).rejects.toThrow('Amazon unavailable');
        expect(persistedCount).toBe(1);
    });

    it('stops after the first empty inventory response', async () => {
        const fetchBatch = vi.fn(async () => []);

        await expect(
            fetchProductMetadataBatches({
                asins: Array.from({ length: 301 }, (_, index) => `B${String(index).padStart(9, '0')}`),
                fetchBatch,
            })
        ).rejects.toThrow('Amazon Product Metadata returned no titled inventory record for advertised ASIN B000000000.');
        expect(fetchBatch).toHaveBeenCalledTimes(1);
    });

    it('requires the preflight response to contain a title', async () => {
        const attemptedAsins: string[] = [];
        await expect(
            fetchProductMetadataBatches({
                asins: ['B000000001'],
                fetchBatch: async asins => asins.map(asin => ({ asin, title: null })),
                onBatch: async asins => {
                    attemptedAsins.push(...asins);
                },
            })
        ).rejects.toThrow('Amazon Product Metadata returned no titled inventory record for advertised ASIN B000000001.');
        expect(attemptedAsins).toEqual(['B000000001']);
    });
});

describe('buildProductMetadataEvent', () => {
    it('emits one compact summary with structured batching details', () => {
        expect(buildProductMetadataEvent('Refreshed', { returnedCount: 301, requestCount: 2 }, { trigger: 'weekly_refresh', maxBatchSize: 300 })).toEqual({
            message: 'Refreshed 301 products in 2 requests.',
            payload: { trigger: 'weekly_refresh', maxBatchSize: 300, returnedCount: 301, requestCount: 2 },
        });
    });

    it('uses singular request wording', () => {
        expect(buildProductMetadataEvent('Updated', { returnedCount: 12, requestCount: 1 }, { trigger: 'new_asins' }).message).toBe('Updated 12 products in 1 request.');
    });
});
