import { afterEach, describe, expect, it } from 'vitest';
import { ad, campaign, jobMetrics, productMetadata } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/operations/testing/create-test-database';
import { buildSearchProductAd, buildSearchProductCampaign } from '@/operations/testing/search-product-fixtures';
import { getProductMetadataCoverage } from './product-metadata-coverage';

describe('getProductMetadataCoverage', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
        database = undefined;
    });

    it('counts distinct advertised ASINs and only usable projected titles', async () => {
        database = await createTestDatabase();
        await database.db.insert(campaign).values(buildSearchProductCampaign());
        await database.db
            .insert(ad)
            .values([
                buildSearchProductAd(),
                buildSearchProductAd({ id: 'coverage-ad-row-2', adId: 'coverage-ad-2' }),
                buildSearchProductAd({ id: 'coverage-ad-row-3', adId: 'coverage-ad-3', productAsin: 'B0PRODUCT002' }),
            ]);
        await database.db.insert(productMetadata).values([
            { countryCode: 'US', asin: 'B0PRODUCT001', title: 'Hydrated title', lastFetchedAt: new Date('2026-08-08T00:00:00Z') },
            { countryCode: 'US', asin: 'B0PRODUCT002', title: null, lastFetchedAt: new Date('2026-08-08T00:00:00Z') },
        ]);

        await expect(getProductMetadataCoverage(database.db, { accountId: 'search-products-ads-account-1', countryCode: 'US' })).resolves.toEqual({
            advertisedCount: 2,
            fetching: false,
            hydratedCount: 1,
        });
    });

    it('reports only a matching product metadata refresh as fetching', async () => {
        database = await createTestDatabase();
        await database.db.insert(jobMetrics).values([
            {
                jobName: 'refresh-product-metadata',
                bossJobId: 'matching-refresh',
                status: 'running',
                startedAt: new Date(),
                input: { accountId: 'search-products-ads-account-1', countryCode: 'US' },
            },
            {
                jobName: 'refresh-product-metadata',
                bossJobId: 'other-refresh',
                status: 'running',
                startedAt: new Date(),
                input: { accountId: 'other-account', countryCode: 'US' },
            },
        ]);

        await expect(getProductMetadataCoverage(database.db, { accountId: 'search-products-ads-account-1', countryCode: 'US' })).resolves.toEqual({
            advertisedCount: 0,
            fetching: true,
            hydratedCount: 0,
        });
    });
});
