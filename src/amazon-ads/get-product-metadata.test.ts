import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProductMetadata } from './get-product-metadata';
import { spRequest } from './sp-api';

vi.mock('./sp-api', () => ({ spRequest: vi.fn() }));

describe('getProductMetadata', () => {
    beforeEach(() => vi.mocked(spRequest).mockReset());

    it('uses the Amazon Product Metadata media types and one batched request', async () => {
        vi.mocked(spRequest).mockResolvedValue({ ProductMetadataList: [{ asin: 'B000000001', title: 'Example' }] });

        await expect(getProductMetadata({ profileId: 123, region: 'na', asins: ['B000000001'] })).resolves.toEqual([{ asin: 'B000000001', title: 'Example' }]);
        expect(spRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                apiName: 'getProductMetadata',
                path: '/product/metadata',
                itemCount: 1,
                contentType: 'application/vnd.productmetadatarequest.v1+json',
                accept: 'application/vnd.productmetadataresponse.v1+json',
                body: { asins: ['B000000001'], checkItemDetails: true, pageIndex: 0, pageSize: 1 },
            }),
            'na'
        );
    });

    it("rejects requests above Amazon's 300-ASIN limit", async () => {
        await expect(getProductMetadata({ profileId: 123, region: 'na', asins: Array.from({ length: 301 }, (_, index) => `B${index}`) })).rejects.toThrow('between 1 and 300');
        expect(spRequest).not.toHaveBeenCalled();
    });
});
