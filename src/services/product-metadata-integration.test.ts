import { gte } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProductMetadata } from '@/amazon-ads/get-product-metadata';
import { productMetadata } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/operations/testing/create-test-database';
import { updateProductMetadata } from './product-metadata';

const mocks = vi.hoisted(() => ({ database: undefined as TestDatabase['db'] | undefined }));

vi.mock('@/db/index', () => ({
    get db() {
        return mocks.database;
    },
}));

vi.mock('@/amazon-ads/get-product-metadata', () => ({ getProductMetadata: vi.fn() }));

describe('product metadata freshness', () => {
    let database: TestDatabase;

    beforeEach(async () => {
        database = await createTestDatabase();
        mocks.database = database.db;
        vi.mocked(getProductMetadata).mockReset();
    });

    afterEach(async () => {
        mocks.database = undefined;
        await database.close();
    });

    it('persists an empty fetch attempt and skips that ASIN for one week', async () => {
        vi.mocked(getProductMetadata).mockResolvedValue([]);
        const freshnessCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        await expect(updateProductMetadata({ countryCode: 'US', profileId: 123, region: 'na', asins: ['B000000001'], skipFetchedAtOrAfter: freshnessCutoff })).rejects.toThrow(
            'Amazon Product Metadata returned no titled inventory record for advertised ASIN B000000001.'
        );

        await expect(database.db.select().from(productMetadata).where(gte(productMetadata.lastFetchedAt, freshnessCutoff))).resolves.toEqual([
            expect.objectContaining({ countryCode: 'US', asin: 'B000000001', title: null }),
        ]);

        await expect(updateProductMetadata({ countryCode: 'US', profileId: 123, region: 'na', asins: ['B000000001'], skipFetchedAtOrAfter: freshnessCutoff })).resolves.toEqual(
            expect.objectContaining({ requestedCount: 1, returnedCount: 0, skippedCount: 1, requestCount: 0 })
        );
        expect(getProductMetadata).toHaveBeenCalledTimes(1);
    });
});
