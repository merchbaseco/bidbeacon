import { afterEach, describe, expect, it, vi } from 'vitest';
import { adGroup, advertiserAccount, campaign, performanceDaily, reportDatasetMetadata, target } from '@/db/schema';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { createOperationContext, type OperationContext } from './operation-context';
import { search } from './search';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';
import {
    buildSearchTarget,
    buildSearchTargetAdGroup,
    buildSearchTargetAdGroupId,
    buildSearchTargetAdvertiserAccount,
    buildSearchTargetCampaign,
    buildSearchTargetPerformanceDaily,
    buildSearchTargetReportMetadata,
    SEARCH_TARGET_ACCOUNT_ID,
    SEARCH_TARGET_OTHER_ACCOUNT_ID,
} from './testing/search-target-fixtures';

describe('Target Search operation', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        vi.useRealTimers();
        await database?.close();
        database = undefined;
    });

    it('returns Target details from the canonical archive while ignoring legacy noncanonical rows', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchTargetAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchTargetCampaign());
        await database.db.insert(adGroup).values(buildSearchTargetAdGroup());
        await database.db.insert(target).values(buildSearchTarget());
        await database.db.insert(performanceDaily).values([
            buildSearchTargetPerformanceDaily(),
            buildSearchTargetPerformanceDaily({
                entityType: 'product',
                entityId: 'B0ADVERTISED001',
                targetMatchType: null,
                impressions: 900,
                clicks: 90,
                spend: '90.00',
                sales: '900.00',
                purchases: 9,
            }),
        ]);
        await database.db.insert(reportDatasetMetadata).values(Array.from({ length: 7 }, (_, index) => buildSearchTargetReportMetadata(`2026-08-${String(index + 1).padStart(2, '0')}`)));

        const result = await search(createSearchContext(database), {
            accountId: SEARCH_TARGET_ACCOUNT_ID,
            resource: 'target',
            fields: [
                'target.id',
                'target.scope',
                'target.type',
                'target.negative',
                'target.keyword',
                'target.asin',
                'target.matchType',
                'target.bid',
                'target.state',
                'target.deliveryStatus',
                'campaign.id',
                'adGroup.id',
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
        });

        expect(result.context).toMatchObject({
            account: { id: SEARCH_TARGET_ACCOUNT_ID, timezone: 'America/Los_Angeles', currency: 'USD' },
            resource: 'target',
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06', source: 'EXPLICIT' },
            coverage: { status: 'COMPLETE', issues: [] },
        });
        expect(result.rows).toEqual([
            {
                'target.id': 'search-target-keyword-1',
                'target.scope': 'AD_GROUP',
                'target.type': 'KEYWORD',
                'target.negative': false,
                'target.keyword': 'funny cat shirt',
                'target.asin': null,
                'target.matchType': 'EXACT',
                'target.bid': 0.45,
                'target.state': 'ENABLED',
                'target.deliveryStatus': 'DELIVERING',
                'campaign.id': 'search-target-campaign-1',
                'adGroup.id': buildSearchTargetAdGroupId,
                'metrics.impressions': 40,
                'metrics.clicks': 4,
                'metrics.spend': 4,
                'metrics.orders': 2,
                'metrics.sales': 8,
                'metrics.acos': 50,
                'metrics.cpc': 1,
                'metrics.ctr': 10,
                'metrics.roas': 2,
                'metrics.cvr': 50,
            },
        ]);
    });

    it('returns every target kind and scope and filters target details through the shared contract', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchTargetAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchTargetCampaign());
        await database.db.insert(adGroup).values(buildSearchTargetAdGroup());
        await database.db.insert(target).values([
            buildSearchTarget(),
            buildSearchTarget({
                id: 'search-target-row-product',
                targetId: 'search-target-product-1',
                targetType: 'PRODUCT',
                targetMatchType: 'PRODUCT_EXACT',
                targetAsin: 'B0TARGETPRODUCT1',
                targetKeyword: null,
                bidAmount: '0.55',
            }),
            buildSearchTarget({
                id: 'search-target-row-auto',
                targetId: 'search-target-auto-1',
                targetType: 'AUTO',
                targetMatchType: null,
                targetAsin: null,
                targetKeyword: null,
                bidAmount: '0.30',
            }),
            buildSearchTarget({
                id: 'search-target-row-negative-keyword',
                targetId: 'search-target-negative-keyword-1',
                targetType: 'KEYWORD',
                targetMatchType: 'PHRASE',
                targetKeyword: 'free',
                bidAmount: null,
                negative: true,
            }),
            buildSearchTarget({
                id: 'search-target-row-negative-product',
                targetId: 'search-target-negative-product-1',
                targetType: 'PRODUCT',
                targetMatchType: 'PRODUCT_EXACT',
                targetAsin: 'B0TARGETNEGATIVE1',
                targetKeyword: null,
                bidAmount: null,
                negative: true,
            }),
            buildSearchTarget({
                id: 'search-target-row-campaign-negative',
                targetId: 'search-target-campaign-negative-1',
                adGroupId: null,
                targetType: 'KEYWORD',
                targetMatchType: 'EXACT',
                targetKeyword: 'blocked',
                bidAmount: null,
                negative: true,
            }),
        ]);

        const fields = ['target.id', 'target.type', 'target.scope', 'target.negative', 'target.keyword', 'target.asin', 'target.matchType', 'target.bid', 'campaign.id', 'adGroup.id'] as const;
        const result = await search(createSearchContext(database), {
            accountId: SEARCH_TARGET_ACCOUNT_ID,
            resource: 'target',
            fields: [...fields],
            orderBy: [{ field: 'target.id', direction: 'asc' }],
        });

        expect(result.rows).toEqual([
            {
                'target.id': 'search-target-auto-1',
                'target.type': 'AUTO',
                'target.scope': 'AD_GROUP',
                'target.negative': false,
                'target.keyword': null,
                'target.asin': null,
                'target.matchType': null,
                'target.bid': 0.3,
                'campaign.id': 'search-target-campaign-1',
                'adGroup.id': buildSearchTargetAdGroupId,
            },
            {
                'target.id': 'search-target-campaign-negative-1',
                'target.type': 'KEYWORD',
                'target.scope': 'CAMPAIGN',
                'target.negative': true,
                'target.keyword': 'blocked',
                'target.asin': null,
                'target.matchType': 'EXACT',
                'target.bid': null,
                'campaign.id': 'search-target-campaign-1',
                'adGroup.id': null,
            },
            {
                'target.id': 'search-target-keyword-1',
                'target.type': 'KEYWORD',
                'target.scope': 'AD_GROUP',
                'target.negative': false,
                'target.keyword': 'funny cat shirt',
                'target.asin': null,
                'target.matchType': 'EXACT',
                'target.bid': 0.45,
                'campaign.id': 'search-target-campaign-1',
                'adGroup.id': buildSearchTargetAdGroupId,
            },
            {
                'target.id': 'search-target-negative-keyword-1',
                'target.type': 'KEYWORD',
                'target.scope': 'AD_GROUP',
                'target.negative': true,
                'target.keyword': 'free',
                'target.asin': null,
                'target.matchType': 'PHRASE',
                'target.bid': null,
                'campaign.id': 'search-target-campaign-1',
                'adGroup.id': buildSearchTargetAdGroupId,
            },
            {
                'target.id': 'search-target-negative-product-1',
                'target.type': 'PRODUCT',
                'target.scope': 'AD_GROUP',
                'target.negative': true,
                'target.keyword': null,
                'target.asin': 'B0TARGETNEGATIVE1',
                'target.matchType': 'PRODUCT_EXACT',
                'target.bid': null,
                'campaign.id': 'search-target-campaign-1',
                'adGroup.id': buildSearchTargetAdGroupId,
            },
            {
                'target.id': 'search-target-product-1',
                'target.type': 'PRODUCT',
                'target.scope': 'AD_GROUP',
                'target.negative': false,
                'target.keyword': null,
                'target.asin': 'B0TARGETPRODUCT1',
                'target.matchType': 'PRODUCT_EXACT',
                'target.bid': 0.55,
                'campaign.id': 'search-target-campaign-1',
                'adGroup.id': buildSearchTargetAdGroupId,
            },
        ]);

        const negativeResult = await search(createSearchContext(database), {
            accountId: SEARCH_TARGET_ACCOUNT_ID,
            resource: 'target',
            fields: ['target.id', 'target.scope', 'target.negative'],
            filters: [{ field: 'target.negative', operator: 'eq', value: true }],
        });
        expect(negativeResult.rows).toEqual([
            { 'target.id': 'search-target-campaign-negative-1', 'target.scope': 'CAMPAIGN', 'target.negative': true },
            { 'target.id': 'search-target-negative-keyword-1', 'target.scope': 'AD_GROUP', 'target.negative': true },
            { 'target.id': 'search-target-negative-product-1', 'target.scope': 'AD_GROUP', 'target.negative': true },
        ]);

        const productResult = await search(createSearchContext(database), {
            accountId: SEARCH_TARGET_ACCOUNT_ID,
            resource: 'target',
            fields: ['target.id', 'target.type', 'target.asin'],
            filters: [{ field: 'target.type', operator: 'in', value: ['PRODUCT', 'AUTO'] }],
        });
        expect(productResult.rows).toEqual([
            { 'target.id': 'search-target-auto-1', 'target.type': 'AUTO', 'target.asin': null },
            { 'target.id': 'search-target-negative-product-1', 'target.type': 'PRODUCT', 'target.asin': 'B0TARGETNEGATIVE1' },
            { 'target.id': 'search-target-product-1', 'target.type': 'PRODUCT', 'target.asin': 'B0TARGETPRODUCT1' },
        ]);

        const keywordResult = await search(createSearchContext(database), {
            accountId: SEARCH_TARGET_ACCOUNT_ID,
            resource: 'target',
            fields: ['target.id', 'target.keyword'],
            filters: [{ field: 'target.keyword', operator: 'contains', value: 'FREE' }],
        });
        expect(keywordResult.rows).toEqual([{ 'target.id': 'search-target-negative-keyword-1', 'target.keyword': 'free' }]);
    });

    it('isolates target settings by advertiser account and marketplace', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values([
            buildSearchTargetAdvertiserAccount(),
            buildSearchTargetAdvertiserAccount({
                id: SEARCH_TARGET_OTHER_ACCOUNT_ID,
                accountName: 'Search target Canada advertiser',
                countryCode: 'CA',
                profileId: 'search-target-profile-2',
                entityId: 'search-target-entity-2',
            }),
        ]);
        await database.db.insert(campaign).values([
            buildSearchTargetCampaign(),
            buildSearchTargetCampaign({
                id: 'search-target-campaign-row-2',
                campaignId: 'search-target-campaign-2',
                countryCode: 'CA',
                name: 'Search target Canada campaign',
            }),
        ]);
        await database.db.insert(target).values([
            buildSearchTarget(),
            buildSearchTarget({
                id: 'search-target-row-ca',
                campaignId: 'search-target-campaign-2',
                targetId: 'search-target-canada-keyword-1',
                adGroupId: null,
                targetKeyword: 'canada-only',
            }),
        ]);

        const result = await search(createSearchContext(database), {
            accountId: SEARCH_TARGET_ACCOUNT_ID,
            resource: 'target',
            fields: ['target.id', 'campaign.id'],
        });

        expect(result.rows).toEqual([{ 'target.id': 'search-target-keyword-1', 'campaign.id': 'search-target-campaign-1' }]);
    });

    it('uses target defaults, account-local seven-day dates, zero-filled date segments, and keyset cursors', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-07T12:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchTargetAdvertiserAccount());
        await database.db.insert(campaign).values(buildSearchTargetCampaign());
        await database.db.insert(adGroup).values(buildSearchTargetAdGroup());
        await database.db.insert(target).values([
            buildSearchTarget(),
            buildSearchTarget({
                id: 'search-target-row-product',
                targetId: 'search-target-product-1',
                targetType: 'PRODUCT',
                targetMatchType: 'PRODUCT_EXACT',
                targetAsin: 'B0TARGETPRODUCT1',
                targetKeyword: null,
            }),
        ]);
        await database.db.insert(performanceDaily).values([
            buildSearchTargetPerformanceDaily({ bucketDate: '2026-08-05', bucketStart: new Date('2026-08-05T07:00:00.000Z'), spend: '3.00', sales: '6.00' }),
            buildSearchTargetPerformanceDaily({ bucketDate: '2026-08-06', spend: '4.00', sales: '8.00' }),
            buildSearchTargetPerformanceDaily({
                targetMatchType: 'PRODUCT_EXACT',
                entityId: 'search-target-product-1',
                bucketDate: '2026-08-06',
                spend: '5.00',
                sales: '10.00',
            }),
        ]);
        await database.db.insert(reportDatasetMetadata).values(Array.from({ length: 7 }, (_, index) => buildSearchTargetReportMetadata(`2026-08-${String(index + 1).padStart(2, '0')}`)));

        const defaultResult = await search(createSearchContext(database), { accountId: SEARCH_TARGET_ACCOUNT_ID, resource: 'target' });
        expect(defaultResult.context.fields).toEqual([
            'target.id',
            'target.state',
            'target.deliveryStatus',
            'target.type',
            'target.scope',
            'target.bid',
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
        ]);
        expect(defaultResult.context.dateRange).toEqual({ startDate: '2026-08-01', endDate: '2026-08-07', source: 'DEFAULT' });
        expect(defaultResult.context.coverage).toEqual({ status: 'COMPLETE', issues: [] });
        expect(defaultResult.rows[0]).toMatchObject({ 'target.id': 'search-target-keyword-1', 'metrics.spend': 7 });

        const input = {
            accountId: SEARCH_TARGET_ACCOUNT_ID,
            resource: 'target' as const,
            fields: ['target.id', 'segments.date', 'metrics.spend'],
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-06' },
            limit: 2,
        };
        const firstPage = await search(createSearchContext(database), input);
        expect(firstPage.rows).toEqual([
            { 'target.id': 'search-target-keyword-1', 'segments.date': '2026-08-05', 'metrics.spend': 3 },
            { 'target.id': 'search-target-product-1', 'segments.date': '2026-08-05', 'metrics.spend': 0 },
        ]);
        expect(firstPage.nextCursor).toEqual(expect.any(String));

        const secondPage = await search(createSearchContext(database), { ...input, cursor: firstPage.nextCursor });
        expect(secondPage.rows).toEqual([
            { 'target.id': 'search-target-keyword-1', 'segments.date': '2026-08-06', 'metrics.spend': 4 },
            { 'target.id': 'search-target-product-1', 'segments.date': '2026-08-06', 'metrics.spend': 5 },
        ]);
        expect(secondPage.nextCursor).toBeUndefined();
    });
});

const createSearchContext = (database: TestDatabase, accessibleAccountIds: string[] = [SEARCH_TARGET_ACCOUNT_ID]): OperationContext =>
    createOperationContext({
        amazonAds: createFakeAmazonAdsGateway(),
        db: database.db,
        principal: {
            accessibleAccountIds,
            credentialKind: 'session',
            merchbaseUserId: 'search-target-test-user',
        },
    });
