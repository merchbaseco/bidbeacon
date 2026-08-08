import { afterEach, describe, expect, it, vi } from 'vitest';
import { ad, adGroup, advertiserAccount, campaign, performanceDaily, performanceHourly, reportDatasetMetadata } from '@/db/schema';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { createOperationContext, type OperationContext } from './operation-context';
import { search } from './search';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';
import {
    buildSearchAdResourcesAd,
    buildSearchAdResourcesAdGroup,
    buildSearchAdResourcesAdvertiserAccount,
    buildSearchAdResourcesCampaign,
    buildSearchAdResourcesPerformanceDaily,
    buildSearchAdResourcesPerformanceHourly,
    buildSearchAdResourcesReportMetadata,
    SEARCH_AD_RESOURCES_ACCOUNT_ID,
    SEARCH_AD_RESOURCES_OTHER_ACCOUNT_ID,
} from './testing/search-ad-resources-fixtures';

describe('Ad-group and Ad Search operations', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        vi.useRealTimers();
        await database?.close();
        database = undefined;
    });

    it('returns default Ad-group fields, Campaign ancestry, and deduplicated aggregate performance', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-07T12:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdResourcesAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchAdResourcesCampaign());
        await database.db.insert(adGroup).values(buildSearchAdResourcesAdGroup());
        await database.db.insert(ad).values(buildSearchAdResourcesAd());
        await database.db
            .insert(performanceDaily)
            .values([
                buildSearchAdResourcesPerformanceDaily(),
                buildSearchAdResourcesPerformanceDaily({ entityId: 'B0SEARCHCHILD002', impressions: 50, clicks: 5, spend: '5.00', sales: '10.00', purchases: 1 }),
            ]);
        await database.db.insert(reportDatasetMetadata).values(
            Array.from({ length: 7 }, (_, index) => {
                const day = String(index + 1).padStart(2, '0');
                return buildSearchAdResourcesReportMetadata(`2026-08-${day}`);
            })
        );

        const result = await search(createSearchContext(database), { accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID, resource: 'ad_group' });

        expect(result.context).toMatchObject({
            resource: 'ad_group',
            fields: [
                'adGroup.id',
                'adGroup.name',
                'adGroup.state',
                'adGroup.deliveryStatus',
                'adGroup.defaultBid',
                'campaign.id',
                'campaign.name',
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
            dateRange: { startDate: '2026-08-01', endDate: '2026-08-07', source: 'DEFAULT' },
            coverage: { status: 'COMPLETE', issues: [] },
        });
        expect(result.rows).toEqual([
            {
                'adGroup.id': 'search-ad-resources-ad-group-1',
                'adGroup.name': 'Search child-resource ad group',
                'adGroup.state': 'ENABLED',
                'adGroup.deliveryStatus': 'DELIVERING',
                'adGroup.defaultBid': 0.75,
                'campaign.id': 'search-ad-resources-campaign-1',
                'campaign.name': 'Search child-resource campaign',
                'metrics.impressions': 150,
                'metrics.clicks': 15,
                'metrics.spend': 15,
                'metrics.orders': 3,
                'metrics.sales': 50,
                'metrics.acos': 30,
                'metrics.cpc': 1,
                'metrics.ctr': 10,
                'metrics.roas': 3.33,
                'metrics.cvr': 20,
            },
        ]);
    });

    it('returns default Ad fields and supports explicit fields, ancestry, and advertised ASIN filtering', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdResourcesAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchAdResourcesCampaign());
        await database.db.insert(adGroup).values(buildSearchAdResourcesAdGroup());
        await database.db.insert(ad).values([
            buildSearchAdResourcesAd(),
            buildSearchAdResourcesAd({
                id: 'search-ad-resources-ad-row-2',
                adId: 'search-ad-resources-ad-2',
                productAsin: 'B0SEARCHCHILD002',
                productTitle: 'Second search child-resource product',
            }),
        ]);
        await database.db
            .insert(performanceDaily)
            .values([
                buildSearchAdResourcesPerformanceDaily(),
                buildSearchAdResourcesPerformanceDaily({ adId: 'search-ad-resources-ad-2', entityId: 'B0SEARCHCHILD002', spend: '2.00', sales: '8.00', purchases: 1 }),
            ]);

        const defaultResult = await search(createSearchContext(database), {
            accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID,
            resource: 'ad',
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });
        expect(defaultResult.context.fields).toEqual([
            'ad.id',
            'ad.state',
            'ad.deliveryStatus',
            'ad.asin',
            'ad.productTitle',
            'adGroup.id',
            'adGroup.name',
            'campaign.id',
            'campaign.name',
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
        ]);
        expect(defaultResult.rows.map(row => row['ad.id'])).toEqual(['search-ad-resources-ad-1', 'search-ad-resources-ad-2']);

        const filteredResult = await search(createSearchContext(database), {
            accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID,
            resource: 'ad',
            fields: ['ad.id', 'ad.asin', 'adGroup.id', 'campaign.id', 'metrics.spend'],
            filters: [{ field: 'ad.asin', operator: 'eq', value: 'B0SEARCHCHILD002' }],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });

        expect(filteredResult.rows).toEqual([
            {
                'ad.id': 'search-ad-resources-ad-2',
                'ad.asin': 'B0SEARCHCHILD002',
                'adGroup.id': 'search-ad-resources-ad-group-1',
                'campaign.id': 'search-ad-resources-campaign-1',
                'metrics.spend': 2,
            },
        ]);

        const explicitResult = await search(createSearchContext(database), {
            accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID,
            resource: 'ad',
            fields: ['ad.id', 'ad.type', 'adGroup.defaultBid', 'campaign.state', 'campaign.dailyBudget'],
        });

        expect(explicitResult.context.dateRange).toBeUndefined();
        expect(explicitResult.rows).toEqual([
            {
                'ad.id': 'search-ad-resources-ad-1',
                'ad.type': 'PRODUCT_AD',
                'adGroup.defaultBid': 0.75,
                'campaign.state': 'ENABLED',
                'campaign.dailyBudget': 30,
            },
            {
                'ad.id': 'search-ad-resources-ad-2',
                'ad.type': 'PRODUCT_AD',
                'adGroup.defaultBid': 0.75,
                'campaign.state': 'ENABLED',
                'campaign.dailyBudget': 30,
            },
        ]);
    });

    it('uses account-local date rows from the canonical Target archive at both child grains', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdResourcesAdvertiserAccount());
        await database.db
            .insert(campaign)
            .values([
                buildSearchAdResourcesCampaign(),
                buildSearchAdResourcesCampaign({ id: 'search-ad-resources-campaign-row-2', campaignId: 'search-ad-resources-campaign-2', name: 'Second search child-resource campaign' }),
            ]);
        await database.db.insert(adGroup).values([
            buildSearchAdResourcesAdGroup(),
            buildSearchAdResourcesAdGroup({
                id: 'search-ad-resources-ad-group-row-2',
                adGroupId: 'search-ad-resources-ad-group-2',
                campaignId: 'search-ad-resources-campaign-2',
                name: 'Second search child-resource ad group',
            }),
        ]);
        await database.db.insert(ad).values([
            buildSearchAdResourcesAd(),
            buildSearchAdResourcesAd({
                id: 'search-ad-resources-ad-row-2',
                adId: 'search-ad-resources-ad-2',
                adGroupId: 'search-ad-resources-ad-group-2',
                campaignId: 'search-ad-resources-campaign-2',
                productAsin: 'B0SEARCHCHILD002',
            }),
        ]);
        await database.db.insert(performanceDaily).values([
            buildSearchAdResourcesPerformanceDaily({ bucketStart: new Date('2026-08-05T07:00:00.000Z'), bucketDate: '2026-08-05', spend: '3.00', sales: '6.00' }),
            buildSearchAdResourcesPerformanceDaily({ spend: '4.00', sales: '8.00' }),
            buildSearchAdResourcesPerformanceDaily({
                adGroupId: 'search-ad-resources-ad-group-2',
                adId: 'search-ad-resources-ad-2',
                campaignId: 'search-ad-resources-campaign-2',
                bucketStart: new Date('2026-08-06T07:00:00.000Z'),
                spend: '5.00',
                sales: '10.00',
            }),
        ]);
        await database.db.insert(performanceHourly).values([
            buildSearchAdResourcesPerformanceHourly({ spend: '2.00', sales: '8.00' }),
            buildSearchAdResourcesPerformanceHourly({ entityId: 'B0SEARCHCHILD002', spend: '5.00', sales: '10.00', impressions: 50, clicks: 5, purchases: 1 }),
            buildSearchAdResourcesPerformanceHourly({
                adGroupId: 'search-ad-resources-ad-group-2',
                adId: 'search-ad-resources-ad-2',
                campaignId: 'search-ad-resources-campaign-2',
                entityId: 'B0SEARCHCHILD002',
                spend: '1.00',
                sales: '4.00',
                impressions: 10,
                clicks: 1,
                purchases: 1,
            }),
        ]);

        const dateResult = await search(createSearchContext(database), {
            accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID,
            resource: 'ad_group',
            fields: ['adGroup.id', 'segments.date', 'metrics.spend'],
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-06' },
        });
        expect(dateResult.rows).toEqual([
            { 'adGroup.id': 'search-ad-resources-ad-group-1', 'segments.date': '2026-08-05', 'metrics.spend': 3 },
            { 'adGroup.id': 'search-ad-resources-ad-group-2', 'segments.date': '2026-08-05', 'metrics.spend': 0 },
            { 'adGroup.id': 'search-ad-resources-ad-group-1', 'segments.date': '2026-08-06', 'metrics.spend': 4 },
            { 'adGroup.id': 'search-ad-resources-ad-group-2', 'segments.date': '2026-08-06', 'metrics.spend': 5 },
        ]);

        const hourlyInputs = [
            { resource: 'ad_group' as const, idField: 'adGroup.id' as const },
            { resource: 'ad' as const, idField: 'ad.id' as const },
        ];
        for (const { resource, idField } of hourlyInputs) {
            const hourlyResult = await search(createSearchContext(database), {
                accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID,
                resource,
                fields: [idField, 'segments.date', 'segments.hour', 'metrics.spend'],
                filters: [{ field: 'segments.hour', operator: 'eq', value: 3 }],
                dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
            });

            expect(hourlyResult.rows).toEqual(
                resource === 'ad_group'
                    ? [
                          { 'adGroup.id': 'search-ad-resources-ad-group-1', 'segments.date': '2026-08-06', 'segments.hour': 3, 'metrics.spend': 7 },
                          { 'adGroup.id': 'search-ad-resources-ad-group-2', 'segments.date': '2026-08-06', 'segments.hour': 3, 'metrics.spend': 1 },
                      ]
                    : [
                          { 'ad.id': 'search-ad-resources-ad-1', 'segments.date': '2026-08-06', 'segments.hour': 3, 'metrics.spend': 7 },
                          { 'ad.id': 'search-ad-resources-ad-2', 'segments.date': '2026-08-06', 'segments.hour': 3, 'metrics.spend': 1 },
                      ]
            );
        }
    });

    it('keeps unselected hour filters aggregated at the selected date grain', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdResourcesAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchAdResourcesCampaign());
        await database.db.insert(adGroup).values(buildSearchAdResourcesAdGroup());
        await database.db.insert(ad).values(buildSearchAdResourcesAd());
        await database.db.insert(performanceHourly).values([
            buildSearchAdResourcesPerformanceHourly({ spend: '2.00' }),
            buildSearchAdResourcesPerformanceHourly({
                bucketStart: new Date('2026-08-06T11:00:00.000Z'),
                bucketHour: 4,
                spend: '5.00',
            }),
        ]);

        const result = await search(createSearchContext(database), {
            accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID,
            resource: 'ad',
            fields: ['ad.id', 'segments.date', 'metrics.spend'],
            filters: [{ field: 'segments.hour', operator: 'in', value: [3, 4] }],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });

        expect(result.rows).toEqual([{ 'ad.id': 'search-ad-resources-ad-1', 'segments.date': '2026-08-06', 'metrics.spend': 7 }]);
    });

    it('keeps selected segments in custom-order cursor boundaries for both child resources', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdResourcesAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchAdResourcesCampaign());
        await database.db.insert(adGroup).values(buildSearchAdResourcesAdGroup());
        await database.db.insert(ad).values(buildSearchAdResourcesAd());

        const inputs = [
            { resource: 'ad_group' as const, idField: 'adGroup.id' as const },
            { resource: 'ad' as const, idField: 'ad.id' as const },
        ];
        for (const { resource, idField } of inputs) {
            const input = {
                accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID,
                resource,
                fields: [idField, 'segments.date', 'metrics.spend'],
                dateRange: { startDate: '2026-08-05', endDate: '2026-08-06' },
                orderBy: [{ field: 'metrics.spend', direction: 'asc' as const }],
                limit: 1,
            };
            const firstPage = await search(createSearchContext(database), input);
            const secondPage = await search(createSearchContext(database), { ...input, cursor: firstPage.nextCursor });

            expect(firstPage.rows).toEqual([{ [idField]: `search-ad-resources-${resource === 'ad' ? 'ad' : 'ad-group'}-1`, 'segments.date': '2026-08-05', 'metrics.spend': 0 }]);
            expect(secondPage.rows).toEqual([{ [idField]: `search-ad-resources-${resource === 'ad' ? 'ad' : 'ad-group'}-1`, 'segments.date': '2026-08-06', 'metrics.spend': 0 }]);
            expect(secondPage.nextCursor).toBeUndefined();
        }
    });

    it('rejects child fields and ambiguous hour grains with compatible-field details', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdResourcesAdvertiserAccount());

        await expect(
            search(createSearchContext(database), {
                accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID,
                resource: 'ad_group',
                fields: ['adGroup.id', 'ad.id'],
            })
        ).rejects.toMatchObject({
            code: 'INVALID_INPUT',
            details: { fields: ['ad.id'], allowedFields: expect.arrayContaining(['adGroup.id', 'campaign.id']) },
        });
        await expect(
            search(createSearchContext(database), {
                accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID,
                resource: 'ad',
                fields: ['ad.id', 'target.id'],
            })
        ).rejects.toMatchObject({
            code: 'INVALID_INPUT',
            details: { fields: ['target.id'], allowedFields: expect.arrayContaining(['ad.id', 'adGroup.id', 'campaign.id']) },
        });
        await expect(
            search(createSearchContext(database), {
                accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID,
                resource: 'ad',
                fields: ['ad.id', 'segments.hour', 'metrics.spend'],
                dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT', details: { field: 'segments.hour' } });
        for (const value of [-1, 3.5, 24]) {
            await expect(
                search(createSearchContext(database), {
                    accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID,
                    resource: 'ad',
                    fields: ['ad.id', 'segments.date', 'segments.hour'],
                    filters: [{ field: 'segments.hour', operator: 'eq', value }],
                    dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
                })
            ).rejects.toMatchObject({ code: 'INVALID_INPUT', details: { field: 'segments.hour' } });
        }
    });

    it('keeps child searches isolated by explicit Account ID and paginates each resource with query-bound cursors', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values([
            buildSearchAdResourcesAdvertiserAccount(),
            buildSearchAdResourcesAdvertiserAccount({
                id: SEARCH_AD_RESOURCES_OTHER_ACCOUNT_ID,
                adsAccountId: 'search-ad-resources-ads-account-2',
                accountName: 'Other child-resource advertiser',
            }),
        ]);
        await database.db.insert(campaign).values([
            buildSearchAdResourcesCampaign(),
            buildSearchAdResourcesCampaign({ id: 'search-ad-resources-campaign-row-2', campaignId: 'search-ad-resources-campaign-2', name: 'Second search child-resource campaign' }),
            buildSearchAdResourcesCampaign({
                id: 'search-ad-resources-campaign-row-other',
                campaignId: 'search-ad-resources-campaign-other',
                accountId: 'search-ad-resources-ads-account-2',
                name: 'Other account campaign',
            }),
        ]);
        await database.db.insert(adGroup).values([
            buildSearchAdResourcesAdGroup(),
            buildSearchAdResourcesAdGroup({
                id: 'search-ad-resources-ad-group-row-2',
                adGroupId: 'search-ad-resources-ad-group-2',
                campaignId: 'search-ad-resources-campaign-2',
                name: 'Second search child-resource ad group',
            }),
            buildSearchAdResourcesAdGroup({
                id: 'search-ad-resources-ad-group-row-other',
                adGroupId: 'search-ad-resources-ad-group-other',
                campaignId: 'search-ad-resources-campaign-other',
                name: 'Other account ad group',
            }),
        ]);
        await database.db.insert(ad).values([
            buildSearchAdResourcesAd(),
            buildSearchAdResourcesAd({ id: 'search-ad-resources-ad-row-2', adId: 'search-ad-resources-ad-2', productAsin: 'B0SEARCHCHILD002' }),
            buildSearchAdResourcesAd({
                id: 'search-ad-resources-ad-row-other',
                adId: 'search-ad-resources-ad-other',
                adGroupId: 'search-ad-resources-ad-group-other',
                campaignId: 'search-ad-resources-campaign-other',
                productAsin: 'B0SEARCHOTHER001',
            }),
        ]);
        await database.db.insert(performanceDaily).values([
            buildSearchAdResourcesPerformanceDaily({ spend: '10.00' }),
            buildSearchAdResourcesPerformanceDaily({
                accountId: 'search-ad-resources-ads-account-2',
                campaignId: 'search-ad-resources-campaign-other',
                adGroupId: 'search-ad-resources-ad-group-other',
                adId: 'search-ad-resources-ad-other',
                entityId: 'B0SEARCHOTHER001',
                spend: '99.00',
            }),
        ]);

        const context = createSearchContext(database, [SEARCH_AD_RESOURCES_ACCOUNT_ID, SEARCH_AD_RESOURCES_OTHER_ACCOUNT_ID]);
        const adGroupFirstPage = await search(context, { accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID, resource: 'ad_group', fields: ['adGroup.id'], limit: 1 });
        const adGroupSecondPage = await search(context, { accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID, resource: 'ad_group', fields: ['adGroup.id'], limit: 1, cursor: adGroupFirstPage.nextCursor });
        expect(adGroupFirstPage.rows).toEqual([{ 'adGroup.id': 'search-ad-resources-ad-group-1' }]);
        expect(adGroupSecondPage.rows).toEqual([{ 'adGroup.id': 'search-ad-resources-ad-group-2' }]);
        expect(adGroupSecondPage.nextCursor).toBeUndefined();

        const adFirstPage = await search(context, { accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID, resource: 'ad', fields: ['ad.id'], limit: 1 });
        const adSecondPage = await search(context, { accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID, resource: 'ad', fields: ['ad.id'], limit: 1, cursor: adFirstPage.nextCursor });
        expect(adFirstPage.rows).toEqual([{ 'ad.id': 'search-ad-resources-ad-1' }]);
        expect(adSecondPage.rows).toEqual([{ 'ad.id': 'search-ad-resources-ad-2' }]);

        await expect(search(context, { accountId: SEARCH_AD_RESOURCES_ACCOUNT_ID, resource: 'ad', fields: ['ad.id', 'ad.asin'], limit: 1, cursor: adFirstPage.nextCursor })).rejects.toMatchObject({
            code: 'CURSOR_INVALID',
        });
        const otherAccountResult = await search(context, {
            accountId: SEARCH_AD_RESOURCES_OTHER_ACCOUNT_ID,
            resource: 'ad_group',
            fields: ['adGroup.id', 'metrics.spend'],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });
        expect(otherAccountResult.rows).toEqual([{ 'adGroup.id': 'search-ad-resources-ad-group-other', 'metrics.spend': 99 }]);
        const otherAdResult = await search(context, {
            accountId: SEARCH_AD_RESOURCES_OTHER_ACCOUNT_ID,
            resource: 'ad',
            fields: ['ad.id', 'metrics.spend'],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });
        expect(otherAdResult.rows).toEqual([{ 'ad.id': 'search-ad-resources-ad-other', 'metrics.spend': 99 }]);
    });
});

const createSearchContext = (database: TestDatabase, accessibleAccountIds: string[] = [SEARCH_AD_RESOURCES_ACCOUNT_ID]): OperationContext =>
    createOperationContext({
        amazonAds: createFakeAmazonAdsGateway(),
        db: database.db,
        principal: {
            accessibleAccountIds,
            credentialKind: 'session',
            merchbaseUserId: 'search-ad-resources-test-user',
        },
    });
