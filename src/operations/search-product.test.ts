import { afterEach, describe, expect, it } from 'vitest';
import { ad, adGroup, advertiserAccount, campaign, performanceDaily, performanceHourly, productMetadata, reportDatasetMetadata } from '@/db/schema';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { createOperationContext, type OperationContext } from './operation-context';
import { search } from './search';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';
import {
    buildSearchProductAd,
    buildSearchProductAdGroup,
    buildSearchProductAdvertiserAccount,
    buildSearchProductCampaign,
    buildSearchProductPerformanceDaily,
    buildSearchProductPerformanceHourly,
    buildSearchProductReportMetadata,
    SEARCH_PRODUCTS_ACCOUNT_ID,
    SEARCH_PRODUCTS_OTHER_ACCOUNT_ID,
} from './testing/search-product-fixtures';

describe('Product Search operation', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
        database = undefined;
    });

    it('returns one advertised-ASIN row with title lookup, canonical cross-ad aggregation, and zero-safe flat metrics', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchProductAdvertiserAccount());
        await database.db.insert(campaign).values([
            buildSearchProductCampaign(),
            buildSearchProductCampaign({
                id: 'search-products-campaign-row-2',
                campaignId: 'search-products-campaign-2',
                name: 'Search Product campaign two',
            }),
        ]);
        await database.db.insert(adGroup).values([
            buildSearchProductAdGroup(),
            buildSearchProductAdGroup({
                id: 'search-products-ad-group-row-2',
                adGroupId: 'search-products-ad-group-2',
                campaignId: 'search-products-campaign-2',
            }),
        ]);
        await database.db.insert(ad).values([
            buildSearchProductAd(),
            buildSearchProductAd({
                id: 'search-products-ad-row-2',
                adId: 'search-products-ad-2',
                productTitle: null,
            }),
            buildSearchProductAd({
                id: 'search-products-ad-row-3',
                adId: 'search-products-ad-3',
                adGroupId: 'search-products-ad-group-2',
                campaignId: 'search-products-campaign-2',
            }),
            buildSearchProductAd({
                id: 'search-products-ad-row-4',
                adId: 'search-products-ad-4',
                productAsin: 'B0PRODUCT002',
                productTitle: null,
            }),
        ]);
        await database.db.insert(performanceDaily).values([
            buildSearchProductPerformanceDaily(),
            buildSearchProductPerformanceDaily({
                adId: 'search-products-ad-2',
                spend: '5.00',
                sales: '10.00',
                purchases: 1,
                impressions: 50,
                clicks: 5,
            }),
            buildSearchProductPerformanceDaily({
                adId: 'search-products-ad-3',
                adGroupId: 'search-products-ad-group-2',
                campaignId: 'search-products-campaign-2',
                spend: '5.00',
                sales: '10.00',
                purchases: 1,
                impressions: 50,
                clicks: 5,
            }),
            buildSearchProductPerformanceDaily({
                adId: 'search-products-ad-1',
                entityId: 'search-products-target-2',
                spend: '1.00',
                sales: '2.00',
                purchases: 1,
                impressions: 10,
                clicks: 1,
            }),
        ]);
        await database.db.insert(reportDatasetMetadata).values(buildSearchProductReportMetadata('2026-08-06'));

        const result = await search(createSearchContext(database), {
            accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
            resource: 'product',
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });

        expect(result.context).toMatchObject({
            resource: 'product',
            fields: [
                'product.asin',
                'product.title',
                'metrics.impressions',
                'metrics.clicks',
                'metrics.spend',
                'metrics.orders',
                'metrics.sales',
                'metrics.acos',
                'metrics.cpc',
                'metrics.ctr',
                'metrics.roas',
                'metrics.cvr',
            ],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06', source: 'EXPLICIT' },
            orderBy: [
                { field: 'metrics.spend', direction: 'desc' },
                { field: 'product.asin', direction: 'asc' },
            ],
            coverage: { status: 'COMPLETE', issues: [] },
        });

        expect(result.rows).toContainEqual({
            'product.asin': 'B0PRODUCT001',
            'product.title': 'Blue product',
            'metrics.impressions': 210,
            'metrics.clicks': 21,
            'metrics.spend': 21,
            'metrics.orders': 5,
            'metrics.sales': 62,
            'metrics.acos': 33.87,
            'metrics.cpc': 1,
            'metrics.ctr': 10,
            'metrics.roas': 2.95,
            'metrics.cvr': 23.81,
        });
        expect(result.rows).toContainEqual({
            'product.asin': 'B0PRODUCT002',
            'product.title': null,
            'metrics.impressions': 0,
            'metrics.clicks': 0,
            'metrics.spend': 0,
            'metrics.orders': 0,
            'metrics.sales': 0,
            'metrics.acos': 0,
            'metrics.cpc': 0,
            'metrics.ctr': 0,
            'metrics.roas': 0,
            'metrics.cvr': 0,
        });
        expect(result.rows.every(row => Object.keys(row).every(field => !(field.startsWith('ad.') || field.startsWith('adGroup.') || field.startsWith('campaign.'))))).toBe(true);

        const cvrResult = await search(createSearchContext(database), {
            accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
            resource: 'product',
            fields: ['product.asin', 'metrics.cvr'],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });
        expect(cvrResult.rows).toEqual([
            { 'product.asin': 'B0PRODUCT001', 'metrics.cvr': 23.81 },
            { 'product.asin': 'B0PRODUCT002', 'metrics.cvr': 0 },
        ]);
    });

    it('supports Product-only fields, ASIN and title filters, and title-then-ASIN settings ordering', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchProductAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchProductCampaign());
        await database.db.insert(adGroup).values(buildSearchProductAdGroup());
        await database.db
            .insert(ad)
            .values([
                buildSearchProductAd({ productAsin: 'B0PRODUCT001', productTitle: 'Zulu product' }),
                buildSearchProductAd({ id: 'search-products-ad-row-2', adId: 'search-products-ad-2', productAsin: 'B0PRODUCT002', productTitle: 'Alpha product' }),
            ]);
        await database.db.insert(productMetadata).values({ countryCode: 'US', asin: 'B0PRODUCT002', title: 'Projected product title', lastSyncedAt: new Date('2026-08-08T00:00:00Z') });

        const titleResult = await search(createSearchContext(database), {
            accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
            resource: 'product',
            fields: ['product.asin', 'product.title'],
            filters: [{ field: 'product.title', operator: 'contains', value: 'PROJECTED' }],
            orderBy: [{ field: 'product.title', direction: 'asc' }],
        });

        expect(titleResult.context).toEqual({
            account: { id: SEARCH_PRODUCTS_ACCOUNT_ID, timezone: 'America/Los_Angeles', currency: 'USD' },
            resource: 'product',
            fields: ['product.asin', 'product.title'],
            orderBy: [
                { field: 'product.title', direction: 'asc' },
                { field: 'product.asin', direction: 'asc' },
            ],
        });
        expect(titleResult.rows).toEqual([{ 'product.asin': 'B0PRODUCT002', 'product.title': 'Projected product title' }]);

        const asinResult = await search(createSearchContext(database), {
            accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
            resource: 'product',
            fields: ['product.asin'],
            filters: [{ field: 'product.asin', operator: 'in', value: ['B0PRODUCT001', 'B0PRODUCT002'] }],
        });
        expect(asinResult.rows).toEqual([{ 'product.asin': 'B0PRODUCT002' }, { 'product.asin': 'B0PRODUCT001' }]);

        await expect(
            search(createSearchContext(database), {
                accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
                resource: 'product',
                fields: ['product.asin', 'campaign.id'],
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT', details: { fields: ['campaign.id'] } });
    });

    it('zero-fills account-local date and hour segments from the canonical Target archive', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchProductAdvertiserAccount());
        await database.db
            .insert(campaign)
            .values([
                buildSearchProductCampaign(),
                buildSearchProductCampaign({ id: 'search-products-campaign-row-2', campaignId: 'search-products-campaign-2', name: 'Search Product campaign two' }),
            ]);
        await database.db
            .insert(adGroup)
            .values([
                buildSearchProductAdGroup(),
                buildSearchProductAdGroup({ id: 'search-products-ad-group-row-2', adGroupId: 'search-products-ad-group-2', campaignId: 'search-products-campaign-2' }),
            ]);
        await database.db.insert(ad).values([
            buildSearchProductAd(),
            buildSearchProductAd({
                id: 'search-products-ad-row-2',
                adId: 'search-products-ad-2',
                productAsin: 'B0PRODUCT001',
                productTitle: null,
            }),
            buildSearchProductAd({
                id: 'search-products-ad-row-3',
                adId: 'search-products-ad-3',
                adGroupId: 'search-products-ad-group-2',
                campaignId: 'search-products-campaign-2',
                productAsin: 'B0PRODUCT002',
                productTitle: null,
            }),
        ]);
        await database.db.insert(performanceDaily).values([
            buildSearchProductPerformanceDaily({ bucketStart: new Date('2026-08-05T07:00:00.000Z'), bucketDate: '2026-08-05', spend: '3.00', sales: '6.00' }),
            buildSearchProductPerformanceDaily({
                adId: 'search-products-ad-2',
                bucketStart: new Date('2026-08-06T07:00:00.000Z'),
                bucketDate: '2026-08-06',
                spend: '4.00',
                sales: '8.00',
            }),
            buildSearchProductPerformanceDaily({
                adId: 'search-products-ad-3',
                adGroupId: 'search-products-ad-group-2',
                campaignId: 'search-products-campaign-2',
                entityId: 'B0PRODUCT002',
                bucketStart: new Date('2026-08-06T07:00:00.000Z'),
                bucketDate: '2026-08-06',
                spend: '5.00',
                sales: '10.00',
            }),
        ]);
        await database.db.insert(performanceHourly).values([
            buildSearchProductPerformanceHourly({ spend: '2.00', sales: '8.00' }),
            buildSearchProductPerformanceHourly({
                adId: 'search-products-ad-2',
                bucketStart: new Date('2026-08-06T11:00:00.000Z'),
                spend: '5.00',
                sales: '10.00',
            }),
            buildSearchProductPerformanceHourly({
                adId: 'search-products-ad-3',
                adGroupId: 'search-products-ad-group-2',
                campaignId: 'search-products-campaign-2',
                entityId: 'B0PRODUCT002',
                spend: '1.00',
                sales: '4.00',
                impressions: 10,
                clicks: 1,
                purchases: 1,
            }),
        ]);
        await database.db.insert(reportDatasetMetadata).values([buildSearchProductReportMetadata('2026-08-05'), buildSearchProductReportMetadata('2026-08-06')]);

        const dateResult = await search(createSearchContext(database), {
            accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
            resource: 'product',
            fields: ['product.asin', 'segments.date', 'metrics.spend'],
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-06' },
        });
        expect(dateResult.rows).toEqual([
            { 'product.asin': 'B0PRODUCT001', 'segments.date': '2026-08-05', 'metrics.spend': 3 },
            { 'product.asin': 'B0PRODUCT002', 'segments.date': '2026-08-05', 'metrics.spend': 0 },
            { 'product.asin': 'B0PRODUCT001', 'segments.date': '2026-08-06', 'metrics.spend': 4 },
            { 'product.asin': 'B0PRODUCT002', 'segments.date': '2026-08-06', 'metrics.spend': 5 },
        ]);

        const hourlyResult = await search(createSearchContext(database), {
            accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
            resource: 'product',
            fields: ['product.asin', 'segments.date', 'segments.hour', 'metrics.spend'],
            filters: [{ field: 'segments.hour', operator: 'eq', value: 3 }],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });
        expect(hourlyResult.rows).toEqual([
            { 'product.asin': 'B0PRODUCT001', 'segments.date': '2026-08-06', 'segments.hour': 3, 'metrics.spend': 7 },
            { 'product.asin': 'B0PRODUCT002', 'segments.date': '2026-08-06', 'segments.hour': 3, 'metrics.spend': 1 },
        ]);
        await expect(
            search(createSearchContext(database), {
                accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
                resource: 'product',
                fields: ['product.asin', 'segments.hour', 'metrics.spend'],
                dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT', details: { field: 'segments.hour' } });
    });

    it('continues Product pages with query-bound cursors and proves Product-to-Ad traversal in the explicit account', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values([
            buildSearchProductAdvertiserAccount(),
            buildSearchProductAdvertiserAccount({
                id: SEARCH_PRODUCTS_OTHER_ACCOUNT_ID,
                adsAccountId: 'search-products-ads-account-1',
                accountName: 'Other Product advertiser',
                countryCode: 'CA',
                profileId: 'search-products-profile-2',
            }),
        ]);
        await database.db.insert(campaign).values([
            buildSearchProductCampaign(),
            buildSearchProductCampaign({ id: 'search-products-campaign-row-2', campaignId: 'search-products-campaign-2', name: 'Search Product campaign two' }),
            buildSearchProductCampaign({
                id: 'search-products-campaign-row-other',
                campaignId: 'search-products-campaign-other',
                accountId: 'search-products-ads-account-1',
                countryCode: 'CA',
                name: 'Other account campaign',
            }),
        ]);
        await database.db.insert(adGroup).values([
            buildSearchProductAdGroup(),
            buildSearchProductAdGroup({ id: 'search-products-ad-group-row-2', adGroupId: 'search-products-ad-group-2', campaignId: 'search-products-campaign-2' }),
            buildSearchProductAdGroup({
                id: 'search-products-ad-group-row-other',
                adGroupId: 'search-products-ad-group-other',
                campaignId: 'search-products-campaign-other',
            }),
        ]);
        await database.db.insert(ad).values([
            buildSearchProductAd(),
            buildSearchProductAd({ id: 'search-products-ad-row-2', adId: 'search-products-ad-2', productAsin: 'B0PRODUCT002', productTitle: 'Second product' }),
            buildSearchProductAd({
                id: 'search-products-ad-row-3',
                adId: 'search-products-ad-3',
                adGroupId: 'search-products-ad-group-2',
                campaignId: 'search-products-campaign-2',
            }),
            buildSearchProductAd({
                id: 'search-products-ad-row-other',
                adId: 'search-products-ad-other',
                adGroupId: 'search-products-ad-group-other',
                campaignId: 'search-products-campaign-other',
                productTitle: 'Other account product',
            }),
        ]);
        await database.db.insert(performanceDaily).values([
            buildSearchProductPerformanceDaily({ spend: '20.00', sales: '60.00' }),
            buildSearchProductPerformanceDaily({
                accountId: 'search-products-ads-account-1',
                campaignId: 'search-products-campaign-other',
                adGroupId: 'search-products-ad-group-other',
                adId: 'search-products-ad-other',
                spend: '99.00',
                sales: '99.00',
            }),
        ]);

        const context = createSearchContext(database, [SEARCH_PRODUCTS_ACCOUNT_ID, SEARCH_PRODUCTS_OTHER_ACCOUNT_ID]);
        const firstPage = await search(context, {
            accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
            resource: 'product',
            fields: ['product.asin'],
            limit: 1,
        });
        expect(firstPage.rows).toEqual([{ 'product.asin': 'B0PRODUCT001' }]);
        expect(firstPage.nextCursor).toEqual(expect.any(String));

        const secondPage = await search(context, {
            accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
            resource: 'product',
            fields: ['product.asin'],
            limit: 1,
            cursor: firstPage.nextCursor,
        });
        expect(secondPage.rows).toEqual([{ 'product.asin': 'B0PRODUCT002' }]);
        expect(secondPage.nextCursor).toBeUndefined();
        await expect(
            search(context, {
                accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
                resource: 'product',
                fields: ['product.asin', 'product.title'],
                limit: 1,
                cursor: firstPage.nextCursor,
            })
        ).rejects.toMatchObject({ code: 'CURSOR_INVALID' });

        const productResult = await search(context, {
            accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
            resource: 'product',
            fields: ['product.asin'],
            filters: [{ field: 'product.asin', operator: 'eq', value: 'B0PRODUCT001' }],
        });
        const asin = productResult.rows[0]?.['product.asin'];
        expect(asin).toBe('B0PRODUCT001');

        const adResult = await search(context, {
            accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
            resource: 'ad',
            fields: ['ad.id', 'ad.asin', 'adGroup.id', 'campaign.id'],
            filters: [{ field: 'ad.asin', operator: 'eq', value: asin }],
        });
        expect(adResult.rows).toEqual([
            { 'ad.id': 'search-products-ad-1', 'ad.asin': 'B0PRODUCT001', 'adGroup.id': 'search-products-ad-group-1', 'campaign.id': 'search-products-campaign-1' },
            { 'ad.id': 'search-products-ad-3', 'ad.asin': 'B0PRODUCT001', 'adGroup.id': 'search-products-ad-group-2', 'campaign.id': 'search-products-campaign-2' },
        ]);

        const accountResult = await search(context, {
            accountId: SEARCH_PRODUCTS_ACCOUNT_ID,
            resource: 'product',
            fields: ['product.asin', 'metrics.spend'],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });
        expect(accountResult.rows).toEqual([
            { 'product.asin': 'B0PRODUCT001', 'metrics.spend': 20 },
            { 'product.asin': 'B0PRODUCT002', 'metrics.spend': 0 },
        ]);

        const otherAccountResult = await search(context, {
            accountId: SEARCH_PRODUCTS_OTHER_ACCOUNT_ID,
            resource: 'product',
            fields: ['product.asin', 'metrics.spend'],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });
        expect(otherAccountResult.rows).toEqual([{ 'product.asin': 'B0PRODUCT001', 'metrics.spend': 99 }]);
    });
});

const createSearchContext = (database: TestDatabase, accessibleAccountIds: string[] = [SEARCH_PRODUCTS_ACCOUNT_ID]): OperationContext =>
    createOperationContext({
        amazonAds: createFakeAmazonAdsGateway(),
        db: database.db,
        principal: {
            accessibleAccountIds,
            credentialKind: 'session',
            merchbaseUserId: 'search-products-test-user',
        },
    });
