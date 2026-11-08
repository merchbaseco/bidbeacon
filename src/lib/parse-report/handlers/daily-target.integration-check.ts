// PGlite database-simulation suite. The `.integration-check.ts` suffix keeps this file in the
// heavy `test:integration` lane (`vitest.integration.config.ts`), not the fast `*.test.ts` lane.
import { gzipSync } from 'node:zlib';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyTargetReportConfig } from '@/config/reports/daily-target';
import { performanceDaily, reportDatasetMetadata, target } from '@/db/schema';
import { buildPerformanceDaily, buildReportDatasetMetadata, buildTarget } from '@/operations/testing/fixtures';
import { handleDailyTarget } from './daily-target';

const testDatabase = vi.hoisted(() => ({ current: undefined as undefined | Awaited<ReturnType<typeof import('@/operations/testing/create-test-database').createTestDatabase>> }));

vi.mock('@/db/index', async () => {
    const { createTestDatabase } = await import('@/operations/testing/create-test-database');
    testDatabase.current = await createTestDatabase();
    return { db: testDatabase.current.db };
});

const ACCOUNT_ID = 'amzn1.ads-account.g.test';
const REPORT_UID = '00000000-0000-4000-8000-0000000000d1';
const PERIOD_START = new Date('2026-11-05T08:00:00.000Z');

describe('handleDailyTarget', () => {
    beforeEach(async () => {
        const db = getDb();
        await db.delete(performanceDaily);
        await db.delete(reportDatasetMetadata);
        await db.delete(target);
        await db
            .insert(target)
            .values([
                buildTarget({ id: 'row-1', targetId: 'target-1', adGroupId: 'ad-group-1', targetKeyword: 'deck the palms', targetAsin: null, targetMatchType: 'EXACT', targetType: 'KEYWORD' }),
                buildTarget({ id: 'row-2', targetId: 'target-2', adGroupId: 'ad-group-1', targetKeyword: 'palm tree', targetAsin: null, targetMatchType: 'EXACT', targetType: 'KEYWORD' }),
            ]);
        await db.insert(reportDatasetMetadata).values(buildReportDatasetMetadata({ uid: REPORT_UID, accountId: ACCOUNT_ID, periodStart: PERIOD_START, aggregation: 'daily' }));
    });

    afterAll(async () => {
        vi.unstubAllGlobals();
        await testDatabase.current?.close();
    });

    it('replaces the report date atomically, dropping rows the report no longer contains', async () => {
        await getDb()
            .insert(performanceDaily)
            .values([
                daily({ adId: 'ad-1', entityId: 'target-1', clicks: 97 }),
                // Added by an earlier hourly derivation; the newer daily report omits it.
                daily({ adId: 'ad-1', entityId: 'target-derived-only', clicks: 3 }),
                // Its report row fails target lookup below, so it must survive.
                daily({ adId: 'ad-unresolved', entityId: 'target-unsynced', clicks: 6 }),
                daily({ bucketDate: '2026-11-04', bucketStart: new Date('2026-11-04T07:00:00.000Z'), adId: 'ad-1', entityId: 'target-old', clicks: 8 }),
            ]);
        stubReport([
            reportRow({ adId: 'ad-1', keyword: 'deck the palms', clicks: 98, purchases: 5, sales: 84.95 }),
            reportRow({ adId: 'ad-1', keyword: 'palm tree', clicks: 2 }),
            reportRow({ adId: 'ad-unresolved', keyword: 'not synced yet', clicks: 6 }),
        ]);

        const result = await handleDailyTarget(input());

        expect(result).toMatchObject({ successCount: 2, errorCount: 1, removedCount: 1, changedCount: 3 });
        expect(await rows('2026-11-05')).toEqual([
            ['ad-1', 'target-1', 98, 5, '84.95'],
            ['ad-1', 'target-2', 2, 0, '0.00'],
            ['ad-unresolved', 'target-unsynced', 6, 2, '50.00'],
        ]);
        expect(await rows('2026-11-04')).toEqual([['ad-1', 'target-old', 8, 2, '50.00']]);
    });

    it('treats an empty report as suspect and removes nothing', async () => {
        await getDb()
            .insert(performanceDaily)
            .values(daily({ adId: 'ad-1', entityId: 'target-1', clicks: 97 }));
        stubReport([]);

        const result = await handleDailyTarget(input());

        expect(result).toMatchObject({ successCount: 0, removedCount: 0 });
        expect(await rows('2026-11-05')).toEqual([['ad-1', 'target-1', 97, 2, '50.00']]);
    });
});

const getDb = () => {
    if (!testDatabase.current) {
        throw new Error('Test database was not created.');
    }
    return testDatabase.current.db;
};

const input = () => ({
    reportUid: REPORT_UID,
    accountId: ACCOUNT_ID,
    periodStart: PERIOD_START,
    reportConfig: dailyTargetReportConfig,
    countryCode: 'US',
    reportUrl: 'https://reports.example.test/daily.json.gz',
});

const daily = (overrides: Partial<Parameters<typeof buildPerformanceDaily>[0]>) =>
    buildPerformanceDaily({ accountId: ACCOUNT_ID, bucketStart: PERIOD_START, bucketDate: '2026-11-05', entityType: 'target', adGroupId: 'ad-group-1', ...overrides });

const reportRow = (row: { adId: string; keyword: string; clicks: number; purchases?: number; sales?: number }) => ({
    'date.value': '2026-11-05',
    'budgetCurrency.value': 'USD',
    'campaign.id': 'campaign-1',
    'campaign.name': 'Christmas - ALL',
    'adGroup.id': 'ad-group-1',
    'adGroup.name': 'Ad group',
    'ad.id': row.adId,
    'target.value': row.keyword,
    'target.matchType': 'EXACT',
    'metric.impressions': row.clicks * 10,
    'metric.clicks': row.clicks,
    'metric.purchases': row.purchases ?? 0,
    'metric.sales': row.sales ?? 0,
    'metric.totalCost': row.clicks * 0.4,
});

const stubReport = (reportRows: unknown[]) => {
    const body = gzipSync(Buffer.from(JSON.stringify(reportRows)));
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(body))
    );
};

const rows = async (bucketDate: string) =>
    (
        await getDb()
            .select()
            .from(performanceDaily)
            .where(and(eq(performanceDaily.accountId, ACCOUNT_ID), eq(performanceDaily.bucketDate, bucketDate)))
            .orderBy(asc(performanceDaily.adId), asc(performanceDaily.entityId))
    ).map(row => [row.adId, row.entityId, row.clicks, row.purchases, row.sales]);
