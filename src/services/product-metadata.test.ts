import { describe, expect, it, vi } from 'vitest';
import { buildProductMetadataEvent, fetchProductMetadataBatches } from './product-metadata-batches';

describe('fetchProductMetadataBatches', () => {
    it.each([
        { count: 300, calls: 1, batchSizes: [300] },
        { count: 301, calls: 2, batchSizes: [300, 1] },
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
                onBatch: async products => {
                    persistedCount += products.length;
                },
            })
        ).rejects.toThrow('Amazon unavailable');
        expect(persistedCount).toBe(300);
    });

    it('stops after the first empty inventory response', async () => {
        const fetchBatch = vi.fn(async () => []);

        await expect(
            fetchProductMetadataBatches({
                asins: Array.from({ length: 301 }, (_, index) => `B${String(index).padStart(9, '0')}`),
                fetchBatch,
            })
        ).rejects.toThrow('Amazon Product Metadata returned no matching inventory for 300 advertised ASINs.');
        expect(fetchBatch).toHaveBeenCalledTimes(1);
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
