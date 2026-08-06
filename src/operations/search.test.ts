import { afterEach, describe, expect, it, vi } from 'vitest';
import { advertiserAccount, campaign, performanceDaily, reportDatasetMetadata, target } from '@/db/schema';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { createOperationContext, type OperationContext } from './operation-context';
import { search } from './search';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';
import {
    buildSearchAdvertiserAccount,
    buildSearchCampaign,
    buildSearchPerformanceDaily,
    buildSearchReportMetadata,
    buildSearchTarget,
    SEARCH_ACCOUNT_ID,
    SEARCH_OTHER_ACCOUNT_ID,
} from './testing/search-fixtures';

describe('Campaign Search operation', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        vi.useRealTimers();
        await database?.close();
        database = undefined;
    });

    it('returns default settings and canonical aggregated performance with account-local date coverage', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-07T12:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdvertiserAccount());
        await database.db.insert(campaign).values([
            buildSearchCampaign(),
            buildSearchCampaign({
                id: 'search-campaign-row-2',
                campaignId: 'campaign-search-2',
                name: 'Beta campaign',
                state: 'PAUSED',
                deliveryStatus: 'NOT_DELIVERING',
            }),
        ]);
        await database.db.insert(performanceDaily).values([
            buildSearchPerformanceDaily(),
            buildSearchPerformanceDaily({
                bucketStart: new Date('2026-08-06T07:00:00.000Z'),
                adId: 'search-ad-2',
                entityId: 'B0SEARCH002',
                impressions: 50,
                clicks: 5,
                spend: '5.00',
                sales: '10.00',
                purchases: 1,
            }),
        ]);
        await database.db.insert(reportDatasetMetadata).values(
            Array.from({ length: 7 }, (_, index) => {
                const day = String(index + 1).padStart(2, '0');
                return buildSearchReportMetadata(`2026-08-${day}`, { totalRecords: index === 6 ? 0 : 1, successRecords: index === 6 ? 0 : 1 });
            })
        );

        const result = await search(createSearchContext(database), { accountId: SEARCH_ACCOUNT_ID, resource: 'campaign' });

        expect(result.context).toEqual({
            account: { id: SEARCH_ACCOUNT_ID, timezone: 'America/Los_Angeles', currency: 'USD' },
            resource: 'campaign',
            fields: [
                'campaign.id',
                'campaign.name',
                'campaign.state',
                'campaign.deliveryStatus',
                'campaign.dailyBudget',
                'metrics.impressions',
                'metrics.clicks',
                'metrics.spend',
                'metrics.orders',
                'metrics.sales',
                'metrics.acos',
                'metrics.cpc',
                'metrics.ctr',
                'metrics.roas',
            ],
            dateRange: { startDate: '2026-08-01', endDate: '2026-08-07', source: 'DEFAULT' },
            orderBy: [
                { field: 'metrics.spend', direction: 'desc' },
                { field: 'campaign.id', direction: 'asc' },
            ],
            coverage: { status: 'COMPLETE', issues: [] },
        });
        expect(result.rows).toEqual([
            {
                'campaign.id': 'campaign-search-1',
                'campaign.name': 'Alpha campaign',
                'campaign.state': 'ENABLED',
                'campaign.deliveryStatus': 'DELIVERING',
                'campaign.dailyBudget': 25,
                'metrics.impressions': 150,
                'metrics.clicks': 15,
                'metrics.spend': 15,
                'metrics.orders': 3,
                'metrics.sales': 50,
                'metrics.acos': 30,
                'metrics.cpc': 1,
                'metrics.ctr': 10,
                'metrics.roas': 3.33,
            },
            {
                'campaign.id': 'campaign-search-2',
                'campaign.name': 'Beta campaign',
                'campaign.state': 'PAUSED',
                'campaign.deliveryStatus': 'NOT_DELIVERING',
                'campaign.dailyBudget': 25,
                'metrics.impressions': 0,
                'metrics.clicks': 0,
                'metrics.spend': 0,
                'metrics.orders': 0,
                'metrics.sales': 0,
                'metrics.acos': 0,
                'metrics.cpc': 0,
                'metrics.ctr': 0,
                'metrics.roas': 0,
            },
        ]);
    });

    it('explicit fields replace defaults and support every structured filter operator', async () => {
        database = await createTestDatabase();
        await seedTwoCampaigns(database);

        const cases = [
            [{ field: 'campaign.id', operator: 'eq', value: 'campaign-search-1' }, ['campaign-search-1']],
            [{ field: 'campaign.id', operator: 'in', value: ['campaign-search-1', 'campaign-search-2'] }, ['campaign-search-1', 'campaign-search-2']],
            [{ field: 'campaign.name', operator: 'contains', value: 'ALPHA' }, ['campaign-search-1']],
            [{ field: 'metrics.spend', operator: 'gt', value: 10 }, ['campaign-search-1']],
            [{ field: 'metrics.spend', operator: 'gte', value: 15 }, ['campaign-search-1']],
            [{ field: 'metrics.spend', operator: 'lt', value: 16 }, ['campaign-search-1', 'campaign-search-2']],
            [{ field: 'metrics.spend', operator: 'lte', value: 0 }, ['campaign-search-2']],
        ] as const;

        for (const [filter, expectedIds] of cases) {
            const result = await search(createSearchContext(database), {
                accountId: SEARCH_ACCOUNT_ID,
                resource: 'campaign',
                fields: ['campaign.id', 'metrics.spend'],
                filters: [filter],
                dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
            });

            expect(result.rows.map(row => row['campaign.id'])).toEqual(expectedIds);
            expect(Object.keys(result.rows[0] ?? {})).toEqual(['campaign.id', 'metrics.spend']);
            expect(result.context.dateRange).toEqual({ startDate: '2026-08-06', endDate: '2026-08-06', source: 'EXPLICIT' });
        }

        const conjunctiveResult = await search(createSearchContext(database), {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id'],
            filters: [
                { field: 'campaign.name', operator: 'contains', value: 'campaign' },
                { field: 'campaign.state', operator: 'eq', value: 'PAUSED' },
            ],
        });
        expect(conjunctiveResult.rows).toEqual([{ 'campaign.id': 'campaign-search-2' }]);

        const unselectedDateFilterResult = await search(createSearchContext(database), {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id', 'metrics.spend'],
            filters: [{ field: 'segments.date', operator: 'eq', value: '2026-08-06' }],
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-06' },
        });
        expect(unselectedDateFilterResult.rows).toEqual([
            { 'campaign.id': 'campaign-search-1', 'metrics.spend': 15 },
            { 'campaign.id': 'campaign-search-2', 'metrics.spend': 0 },
        ]);
    });

    it('resolves default dates at the account-local UTC boundary and omits performance context for settings-only fields', async () => {
        database = await createTestDatabase();
        await seedTwoCampaigns(database);

        const performanceResult = await search(
            createSearchContext(database),
            { accountId: SEARCH_ACCOUNT_ID, resource: 'campaign', fields: ['campaign.id', 'metrics.spend'] },
            { now: new Date('2026-08-07T06:30:00.000Z') }
        );
        expect(performanceResult.context.dateRange).toEqual({ startDate: '2026-07-31', endDate: '2026-08-06', source: 'DEFAULT' });

        const settingsResult = await search(createSearchContext(database), {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id'],
            orderBy: [{ field: 'campaign.name', direction: 'desc' }],
        });
        expect(settingsResult.context).toEqual({
            account: { id: SEARCH_ACCOUNT_ID, timezone: 'America/Los_Angeles', currency: 'USD' },
            resource: 'campaign',
            fields: ['campaign.id'],
            orderBy: [
                { field: 'campaign.name', direction: 'desc' },
                { field: 'campaign.id', direction: 'asc' },
            ],
        });
        expect(settingsResult.rows.map(row => row['campaign.id'])).toEqual(['campaign-search-2', 'campaign-search-1']);
    });

    it('maps production Campaign export enums into the public Search vocabulary', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdvertiserAccount());
        await database.db.insert(campaign).values([
            buildSearchCampaign({ targetingSettings: 'MANUAL' }),
            buildSearchCampaign({
                id: 'search-campaign-row-2',
                campaignId: 'campaign-search-2',
                name: 'Beta campaign',
                targetingSettings: 'MANUAL',
                bidStrategy: 'RULE_BASED',
            }),
        ]);
        await database.db.insert(target).values([
            buildSearchTarget(),
            buildSearchTarget({
                id: 'search-target-row-2',
                campaignId: 'campaign-search-2',
                targetId: 'search-target-2',
                targetAsin: null,
                targetKeyword: null,
                targetType: 'PRODUCT_CATEGORY',
            }),
        ]);

        const result = await search(createSearchContext(database), {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id', 'campaign.targetingMode', 'campaign.bidStrategy'],
        });

        expect(result.rows).toEqual([
            {
                'campaign.id': 'campaign-search-1',
                'campaign.targetingMode': 'MANUAL_KEYWORD',
                'campaign.bidStrategy': 'DYNAMIC_DOWN_ONLY',
            },
            {
                'campaign.id': 'campaign-search-2',
                'campaign.targetingMode': 'MANUAL_PRODUCT',
                'campaign.bidStrategy': null,
            },
        ]);
    });

    it('fills date segments, keeps deterministic ordering, and continues with an integrity-protected keyset cursor', async () => {
        database = await createTestDatabase();
        await seedTwoCampaigns(database);

        const input = {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign' as const,
            fields: ['campaign.id', 'segments.date', 'metrics.spend'],
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-06' },
            limit: 2,
        };
        const firstPage = await search(createSearchContext(database), input);

        expect(firstPage.rows).toEqual([
            { 'campaign.id': 'campaign-search-1', 'segments.date': '2026-08-05', 'metrics.spend': 0 },
            { 'campaign.id': 'campaign-search-2', 'segments.date': '2026-08-05', 'metrics.spend': 0 },
        ]);
        expect(firstPage.nextCursor).toEqual(expect.any(String));
        expect(firstPage.context.orderBy).toEqual([
            { field: 'segments.date', direction: 'asc' },
            { field: 'campaign.id', direction: 'asc' },
        ]);

        const secondPage = await search(createSearchContext(database), { ...input, cursor: firstPage.nextCursor });
        expect(secondPage.rows).toEqual([
            { 'campaign.id': 'campaign-search-1', 'segments.date': '2026-08-06', 'metrics.spend': 15 },
            { 'campaign.id': 'campaign-search-2', 'segments.date': '2026-08-06', 'metrics.spend': 0 },
        ]);
        expect(secondPage.nextCursor).toBeUndefined();

        await expect(
            search(createSearchContext(database), { ...input, fields: ['campaign.id', 'segments.date', 'metrics.spend', 'metrics.clicks'], cursor: firstPage.nextCursor })
        ).rejects.toMatchObject({ code: 'CURSOR_INVALID' });
        const tamperedCursor = `${firstPage.nextCursor?.slice(0, -1)}${firstPage.nextCursor?.endsWith('x') ? 'y' : 'x'}`;
        await expect(search(createSearchContext(database), { ...input, cursor: tamperedCursor })).rejects.toMatchObject({ code: 'CURSOR_INVALID' });
        await expect(search(createSearchContext(database), { ...input, limit: 201 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('uses an unselected date segment as the internal row grain for ordering', async () => {
        database = await createTestDatabase();
        await seedTwoCampaigns(database);
        await database.db.insert(performanceDaily).values(
            buildSearchPerformanceDaily({
                accountId: 'search-ads-account-1',
                bucketStart: new Date('2026-08-05T07:00:00.000Z'),
                bucketDate: '2026-08-05',
                campaignId: 'campaign-search-2',
                adGroupId: 'search-ad-group-2',
                adId: 'search-ad-3',
                entityId: 'B0SEARCH003',
                spend: '20.00',
                sales: '20.00',
            })
        );

        const result = await search(createSearchContext(database), {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id', 'metrics.spend'],
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-06' },
            orderBy: [{ field: 'segments.date', direction: 'desc' }],
            limit: 2,
        });

        expect(result.context.orderBy).toEqual([
            { field: 'segments.date', direction: 'desc' },
            { field: 'campaign.id', direction: 'asc' },
        ]);
        expect(result.rows).toEqual([
            { 'campaign.id': 'campaign-search-1', 'metrics.spend': 15 },
            { 'campaign.id': 'campaign-search-2', 'metrics.spend': 0 },
        ]);
        expect(result.nextCursor).toEqual(expect.any(String));
    });

    it('reports pending, failed, parse-error, and unknown archive dates without treating them as zero coverage', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchCampaign());
        await database.db
            .insert(reportDatasetMetadata)
            .values([
                buildSearchReportMetadata('2026-08-01'),
                buildSearchReportMetadata('2026-08-02', { status: 'fetching' }),
                buildSearchReportMetadata('2026-08-03', { status: 'failed', error: 'Amazon failed' }),
                buildSearchReportMetadata('2026-08-04', { errorRecords: 2, successRecords: 3, totalRecords: 5 }),
            ]);

        const result = await search(createSearchContext(database), {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id', 'metrics.spend'],
            dateRange: { startDate: '2026-08-01', endDate: '2026-08-05' },
        });

        expect(result.context.coverage).toEqual({
            status: 'INCOMPLETE',
            issues: [
                { date: '2026-08-02', status: 'PENDING' },
                { date: '2026-08-03', status: 'FAILED' },
                { date: '2026-08-04', status: 'PARSE_ERRORS', errorCount: 2 },
                { date: '2026-08-05', status: 'UNKNOWN' },
            ],
        });

        const knownIssuesOnly = await search(createSearchContext(database), {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id', 'metrics.spend'],
            dateRange: { startDate: '2026-08-02', endDate: '2026-08-04' },
        });
        expect(knownIssuesOnly.context.coverage?.status).toBe('INCOMPLETE');

        const unknownOnly = await search(createSearchContext(database), {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id', 'metrics.spend'],
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-05' },
        });
        expect(unknownOnly.context.coverage).toEqual({ status: 'UNKNOWN', issues: [{ date: '2026-08-05', status: 'UNKNOWN' }] });
    });

    it('keeps account routing explicit and isolates campaigns and archive rows by the resolved account', async () => {
        database = await createTestDatabase();
        await database.db
            .insert(advertiserAccount)
            .values([
                buildSearchAdvertiserAccount(),
                buildSearchAdvertiserAccount({ id: SEARCH_OTHER_ACCOUNT_ID, adsAccountId: 'search-ads-account-2', accountName: 'Other advertiser', profileId: 'search-profile-2' }),
            ]);
        await database.db
            .insert(campaign)
            .values([buildSearchCampaign(), buildSearchCampaign({ id: 'search-campaign-row-other', campaignId: 'campaign-other', accountId: 'search-ads-account-2', name: 'Other campaign' })]);
        await database.db
            .insert(performanceDaily)
            .values([
                buildSearchPerformanceDaily(),
                buildSearchPerformanceDaily({ accountId: 'search-ads-account-2', campaignId: 'campaign-other', adId: 'other-ad', entityId: 'B0OTHER001', spend: '99.00', sales: '99.00' }),
            ]);

        const context = createSearchContext(database, [SEARCH_ACCOUNT_ID, SEARCH_OTHER_ACCOUNT_ID]);
        const result = await search(context, {
            accountId: SEARCH_ACCOUNT_ID,
            resource: 'campaign',
            fields: ['campaign.id', 'metrics.spend'],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });

        expect(result.rows).toEqual([{ 'campaign.id': 'campaign-search-1', 'metrics.spend': 10 }]);
        await expect(search(createSearchContext(database), { accountId: SEARCH_OTHER_ACCOUNT_ID, resource: 'campaign' })).rejects.toMatchObject({ code: 'ACCOUNT_ACCESS_DENIED' });
    });

    it('rejects unsupported fields, invalid filter values, settings date ranges, and future Search resources with the stable public error shape', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchAdvertiserAccount());

        await expect(search(createSearchContext(database), { accountId: SEARCH_ACCOUNT_ID, resource: 'campaign', fields: ['ad.id'] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(
            search(createSearchContext(database), {
                accountId: SEARCH_ACCOUNT_ID,
                resource: 'campaign',
                fields: ['campaign.id'],
                filters: [{ field: 'campaign.id', operator: 'contains', value: 'campaign' }],
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(
            search(createSearchContext(database), { accountId: SEARCH_ACCOUNT_ID, resource: 'campaign', fields: ['campaign.id'], filters: [{ field: 'campaign.id', operator: 'eq', value: 1 }] })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(
            search(createSearchContext(database), { accountId: SEARCH_ACCOUNT_ID, resource: 'campaign', fields: ['campaign.id'], dateRange: { startDate: '2026-08-01', endDate: '2026-08-02' } })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(search(createSearchContext(database), { accountId: SEARCH_ACCOUNT_ID, resource: 'target' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
});

const createSearchContext = (database: TestDatabase, accessibleAccountIds: string[] = [SEARCH_ACCOUNT_ID]): OperationContext =>
    createOperationContext({
        amazonAds: createFakeAmazonAdsGateway(),
        db: database.db,
        principal: {
            accessibleAccountIds,
            credentialKind: 'session',
            merchbaseUserId: 'search-test-user',
        },
    });

const seedTwoCampaigns = async (database: TestDatabase) => {
    await database.db.insert(advertiserAccount).values(buildSearchAdvertiserAccount());
    await database.db
        .insert(campaign)
        .values([
            buildSearchCampaign(),
            buildSearchCampaign({ id: 'search-campaign-row-2', campaignId: 'campaign-search-2', name: 'Beta campaign', state: 'PAUSED', deliveryStatus: 'NOT_DELIVERING' }),
        ]);
    await database.db.insert(performanceDaily).values([
        buildSearchPerformanceDaily(),
        buildSearchPerformanceDaily({
            bucketStart: new Date('2026-08-06T07:00:00.000Z'),
            adId: 'search-ad-2',
            entityId: 'B0SEARCH002',
            impressions: 50,
            clicks: 5,
            spend: '5.00',
            sales: '10.00',
            purchases: 1,
        }),
    ]);
};
