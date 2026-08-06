import { afterEach, describe, expect, it } from 'vitest';
import { advertiserAccount, campaign, performanceDaily, performanceDailyPlacement, reportDatasetMetadata } from '@/db/schema';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { createOperationContext } from './operation-context';
import { search } from './search';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';
import { buildSearchPlacementPerformanceDaily } from './testing/placement-search-fixtures';
import { buildSearchAdvertiserAccount, buildSearchCampaign, buildSearchPerformanceDaily, buildSearchReportMetadata, SEARCH_ACCOUNT_ID, SEARCH_OTHER_ACCOUNT_ID } from './testing/search-fixtures';

describe('Campaign placement Search', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
        database = undefined;
    });

    it('returns standard Campaign metrics at the dedicated placement grain', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchCampaign());
        await database.db.insert(performanceDaily).values(buildSearchPerformanceDaily({ spend: '99.00', sales: '99.00' }));
        await database.db
            .insert(performanceDailyPlacement)
            .values([
                buildSearchPlacementPerformanceDaily(),
                buildSearchPlacementPerformanceDaily({ placement: 'PRODUCT_PAGE', impressions: 50, clicks: 5, spend: '5.00', sales: '15.00', purchases: 1 }),
            ]);
        await database.db.insert(reportDatasetMetadata).values(buildSearchReportMetadata('2026-08-06', { entityType: 'placement' }));

        const result = await search(createSearchContext(database), {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: [
                'campaign.id',
                'segments.placement',
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
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
            orderBy: [{ field: 'segments.placement', direction: 'asc' }],
        });

        expect(result.rows).toEqual([
            {
                'campaign.id': 'campaign-search-1',
                'segments.placement': 'PRODUCT_PAGE',
                'metrics.impressions': 50,
                'metrics.clicks': 5,
                'metrics.spend': 5,
                'metrics.orders': 1,
                'metrics.sales': 15,
                'metrics.acos': 33.33,
                'metrics.cpc': 1,
                'metrics.ctr': 10,
                'metrics.roas': 3,
                'metrics.cvr': 20,
            },
            {
                'campaign.id': 'campaign-search-1',
                'segments.placement': 'TOP_OF_SEARCH',
                'metrics.impressions': 100,
                'metrics.clicks': 10,
                'metrics.spend': 10,
                'metrics.orders': 2,
                'metrics.sales': 40,
                'metrics.acos': 25,
                'metrics.cpc': 1,
                'metrics.ctr': 10,
                'metrics.roas': 4,
                'metrics.cvr': 20,
            },
        ]);
    });

    it('zero-fills each observed placement across the requested account-local dates', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchCampaign());
        await database.db
            .insert(performanceDailyPlacement)
            .values([
                buildSearchPlacementPerformanceDaily({ bucketStart: new Date('2026-08-05T07:00:00.000Z'), bucketDate: '2026-08-05' }),
                buildSearchPlacementPerformanceDaily({ bucketDate: '2026-08-06', placement: 'PRODUCT_PAGE', impressions: 50, clicks: 5, spend: '5.00', sales: '15.00', purchases: 1 }),
            ]);
        await database.db
            .insert(reportDatasetMetadata)
            .values([buildSearchReportMetadata('2026-08-05', { entityType: 'placement' }), buildSearchReportMetadata('2026-08-06', { entityType: 'placement' })]);

        const result = await search(createSearchContext(database), {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id', 'segments.date', 'segments.placement', 'metrics.impressions'],
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-06' },
        });

        expect(result.context.orderBy).toEqual([
            { field: 'segments.date', direction: 'asc' },
            { field: 'segments.placement', direction: 'asc' },
            { field: 'campaign.id', direction: 'asc' },
        ]);
        expect(result.rows).toEqual([
            { 'campaign.id': 'campaign-search-1', 'segments.date': '2026-08-05', 'segments.placement': 'PRODUCT_PAGE', 'metrics.impressions': 0 },
            { 'campaign.id': 'campaign-search-1', 'segments.date': '2026-08-05', 'segments.placement': 'TOP_OF_SEARCH', 'metrics.impressions': 100 },
            { 'campaign.id': 'campaign-search-1', 'segments.date': '2026-08-06', 'segments.placement': 'PRODUCT_PAGE', 'metrics.impressions': 50 },
            { 'campaign.id': 'campaign-search-1', 'segments.date': '2026-08-06', 'segments.placement': 'TOP_OF_SEARCH', 'metrics.impressions': 0 },
        ]);
    });

    it('paginates explicit placement ordering with every selected grain field as a cursor tie-breaker', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchCampaign());
        await database.db
            .insert(performanceDailyPlacement)
            .values([
                buildSearchPlacementPerformanceDaily({ bucketStart: new Date('2026-08-05T07:00:00.000Z'), bucketDate: '2026-08-05' }),
                buildSearchPlacementPerformanceDaily({ bucketDate: '2026-08-06' }),
            ]);
        await database.db
            .insert(reportDatasetMetadata)
            .values([buildSearchReportMetadata('2026-08-05', { entityType: 'placement' }), buildSearchReportMetadata('2026-08-06', { entityType: 'placement' })]);
        const input = {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id', 'segments.date', 'segments.placement', 'metrics.impressions'],
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-06' },
            orderBy: [{ field: 'segments.placement', direction: 'asc' }],
            limit: 1,
        };

        const firstPage = await search(createSearchContext(database), input);
        const secondPage = await search(createSearchContext(database), { ...input, cursor: firstPage.nextCursor });

        expect(firstPage.context.orderBy).toEqual([
            { field: 'segments.placement', direction: 'asc' },
            { field: 'segments.date', direction: 'asc' },
            { field: 'campaign.id', direction: 'asc' },
        ]);
        expect([...firstPage.rows, ...secondPage.rows]).toEqual([
            { 'campaign.id': 'campaign-search-1', 'segments.date': '2026-08-05', 'segments.placement': 'TOP_OF_SEARCH', 'metrics.impressions': 100 },
            { 'campaign.id': 'campaign-search-1', 'segments.date': '2026-08-06', 'segments.placement': 'TOP_OF_SEARCH', 'metrics.impressions': 100 },
        ]);
    });

    it('applies a placement filter against the dedicated archive at Campaign grain', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchCampaign());
        await database.db
            .insert(performanceDailyPlacement)
            .values([
                buildSearchPlacementPerformanceDaily(),
                buildSearchPlacementPerformanceDaily({ placement: 'PRODUCT_PAGE', spend: '5.00', sales: '15.00', impressions: 50, clicks: 5, purchases: 1 }),
            ]);
        await database.db.insert(reportDatasetMetadata).values(buildSearchReportMetadata('2026-08-06', { entityType: 'placement' }));

        const result = await search(createSearchContext(database), {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id', 'segments.date', 'metrics.spend'],
            filters: [{ field: 'segments.placement', operator: 'eq', value: 'TOP_OF_SEARCH' }],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });

        expect(result.rows).toEqual([{ 'campaign.id': 'campaign-search-1', 'segments.date': '2026-08-06', 'metrics.spend': 10 }]);
    });

    it('uses placement coverage metadata instead of ordinary ASIN coverage', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchCampaign());
        await database.db.insert(performanceDaily).values(buildSearchPerformanceDaily());
        await database.db.insert(reportDatasetMetadata).values(buildSearchReportMetadata('2026-08-06'));

        const result = await search(createSearchContext(database), {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id', 'segments.placement', 'metrics.spend'],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });

        expect(result.context.coverage).toEqual({ status: 'UNKNOWN', issues: [{ date: '2026-08-06', status: 'UNKNOWN' }] });
    });

    it('resolves the default seven-day range in the Advertiser account timezone', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchCampaign());
        await database.db.insert(performanceDailyPlacement).values(buildSearchPlacementPerformanceDaily());

        const result = await search(
            createSearchContext(database),
            {
                accountId: SEARCH_ACCOUNT_ID,
                resource: 'campaign',
                fields: ['campaign.id', 'segments.placement', 'metrics.impressions'],
            },
            { now: new Date('2026-08-06T18:00:00.000Z') }
        );

        expect(result.context.dateRange).toEqual({ startDate: '2026-07-31', endDate: '2026-08-06', source: 'DEFAULT' });
        expect(result.rows).toEqual([{ 'campaign.id': 'campaign-search-1', 'segments.placement': 'TOP_OF_SEARCH', 'metrics.impressions': 100 }]);
    });

    it('keeps placement rows isolated to the explicitly authorized Advertiser Account UUID', async () => {
        database = await createTestDatabase();
        await database.db
            .insert(advertiserAccount)
            .values([buildSearchAdvertiserAccount(), buildSearchAdvertiserAccount({ id: SEARCH_OTHER_ACCOUNT_ID, adsAccountId: 'search-ads-account-2', entityId: 'search-entity-2' })]);
        await database.db.insert(campaign).values([buildSearchCampaign(), buildSearchCampaign({ id: 'search-campaign-row-2', campaignId: 'campaign-search-2', accountId: 'search-ads-account-2' })]);
        await database.db
            .insert(performanceDailyPlacement)
            .values([
                buildSearchPlacementPerformanceDaily({ impressions: 100 }),
                buildSearchPlacementPerformanceDaily({ accountId: 'search-ads-account-2', campaignId: 'campaign-search-2', impressions: 999 }),
            ]);
        await database.db.insert(reportDatasetMetadata).values(buildSearchReportMetadata('2026-08-06', { entityType: 'placement' }));

        const result = await search(createSearchContext(database, [SEARCH_ACCOUNT_ID, SEARCH_OTHER_ACCOUNT_ID]), {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id', 'segments.placement', 'metrics.impressions'],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });

        expect(result.rows).toEqual([{ 'campaign.id': 'campaign-search-1', 'segments.placement': 'TOP_OF_SEARCH', 'metrics.impressions': 100 }]);
    });

    it('rejects non-public placement filters and hourly placement combinations', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdvertiserAccount());

        await expect(
            search(createSearchContext(database), {
                accountId: SEARCH_ACCOUNT_ID,
                resource: 'campaign',
                fields: ['campaign.id', 'metrics.spend'],
                filters: [{ field: 'segments.placement', operator: 'eq', value: 'UNKNOWN_PLACEMENT' }],
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

        await expect(
            search(createSearchContext(database), {
                accountId: SEARCH_ACCOUNT_ID,
                resource: 'campaign',
                fields: ['campaign.id', 'segments.placement', 'segments.hour'],
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'segments.placement cannot be combined with segments.hour.' });

        await expect(
            search(createSearchContext(database), {
                accountId: SEARCH_ACCOUNT_ID,
                resource: 'product',
                fields: ['campaign.id', 'segments.placement'],
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'segments.placement is only compatible with Campaign Search.' });
    });
});

const createSearchContext = (database: TestDatabase, accessibleAccountIds = [SEARCH_ACCOUNT_ID]) =>
    createOperationContext({
        amazonAds: createFakeAmazonAdsGateway(),
        db: database.db,
        principal: {
            accessibleAccountIds,
            credentialKind: 'session',
            merchbaseUserId: 'placement-search-test-user',
        },
    });
