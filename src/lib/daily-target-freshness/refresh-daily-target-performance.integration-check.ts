// PGlite database-simulation suite. The `.integration-check.ts` suffix keeps this file in the
// heavy `test:integration` lane (`vitest.integration.config.ts`), not the fast `*.test.ts` lane.
import { and, asc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { advertiserAccount, amsSpConversion, amsSpTraffic, jobMetrics, performanceDaily, performanceHourly, reportDatasetMetadata } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/operations/testing/create-test-database';
import { buildAdvertiserAccount, buildPerformanceDaily, buildPerformanceHourly, buildReportDatasetMetadata } from '@/operations/testing/fixtures';
import { refreshDailyTargetPerformance } from './refresh-daily-target-performance';

const ACCOUNT_ID = 'amzn1.ads-account.g.test';
const OTHER_ACCOUNT_ID = 'amzn1.ads-account.g.other';
// 2026-11-07 22:07 PT: today is Nov 7, closed dates are Nov 6 and Nov 5.
const NOW = new Date('2026-11-08T06:07:45.000Z');

describe('refreshDailyTargetPerformance', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
        database = undefined;
    });

    it('replaces a closed date with its hourly sums when the hourly report is newer than the daily report', async () => {
        database = await createTestDatabase();
        await database.db
            .insert(reportDatasetMetadata)
            .values([metadata('2026-11-05T08:00:00.000Z', 'daily', '2026-11-06T08:00:14.557Z'), metadata('2026-11-05T08:00:00.000Z', 'hourly', '2026-11-07T08:06:24.957Z')]);
        await database.db.insert(performanceHourly).values([
            hourly('2026-11-05T17:00:00.000Z', '2026-11-05', 9, { entityId: 'target-1', clicks: 3, spend: '1.20', purchases: 0, sales: '0.00' }),
            hourly('2026-11-05T20:00:00.000Z', '2026-11-05', 12, { entityId: 'target-1', clicks: 2, spend: '0.80', purchases: 1, sales: '16.99' }),
            // Present only in hourly: Amazon attributed it after the T+1 daily report.
            hourly('2026-11-05T22:00:00.000Z', '2026-11-05', 14, { entityId: 'target-2', clicks: 1, spend: '0.45', purchases: 1, sales: '16.99' }),
            // Next local date and another account must not leak into Nov 5.
            hourly('2026-11-06T08:00:00.000Z', '2026-11-06', 0, { entityId: 'target-1', clicks: 50 }),
            hourly('2026-11-05T17:00:00.000Z', '2026-11-05', 9, { accountId: OTHER_ACCOUNT_ID, entityId: 'target-1', clicks: 70 }),
        ]);
        await database.db.insert(performanceDaily).values([
            daily('2026-11-05', { entityId: 'target-1', clicks: 4, spend: '1.60', purchases: 0, sales: '0.00' }),
            // Present only in the older daily report, with no activity left in hourly.
            daily('2026-11-05', { entityId: 'target-zero', impressions: 0, clicks: 0, spend: '0.00', purchases: 0, sales: '0.00' }),
            daily('2026-11-05', { accountId: OTHER_ACCOUNT_ID, entityId: 'target-1', clicks: 9 }),
        ]);

        const results = await refreshDailyTargetPerformance({ database: database.db, accountId: ACCOUNT_ID, countryCode: 'US', now: NOW });

        expect(results.find(result => result.bucketDate === '2026-11-05')).toMatchObject({
            outcome: 'derived-from-hourly',
            decision: { source: 'hourly', reason: 'hourly-newer' },
            rowsDerived: 2,
            rowsChanged: 2,
            rowsRemoved: 1,
        });
        expect(await dailyRows(database, ACCOUNT_ID, '2026-11-05')).toEqual([
            { bucketStart: '2026-11-05T08:00:00.000Z', entityId: 'target-1', impressions: 200, clicks: 5, spend: '2.00', sales: '16.99', purchases: 1 },
            { bucketStart: '2026-11-05T08:00:00.000Z', entityId: 'target-2', impressions: 100, clicks: 1, spend: '0.45', sales: '16.99', purchases: 1 },
        ]);
        expect(await dailyRows(database, OTHER_ACCOUNT_ID, '2026-11-05')).toMatchObject([{ entityId: 'target-1', clicks: 9 }]);

        // A second run with unchanged hourly data rewrites nothing.
        const rerun = await refreshDailyTargetPerformance({ database: database.db, accountId: ACCOUNT_ID, countryCode: 'US', now: NOW });
        expect(rerun.find(result => result.bucketDate === '2026-11-05')).toMatchObject({ outcome: 'derived-from-hourly', rowsChanged: 0, rowsRemoved: 0 });
    });

    it('keeps the daily report rows when the daily report was created after the hourly data', async () => {
        database = await createTestDatabase();
        await database.db
            .insert(reportDatasetMetadata)
            .values([metadata('2026-11-05T08:00:00.000Z', 'daily', '2026-11-07T08:38:25.613Z'), metadata('2026-11-05T08:00:00.000Z', 'hourly', '2026-11-07T08:32:26.962Z')]);
        await database.db
            .insert(performanceHourly)
            .values([
                hourly('2026-11-05T17:00:00.000Z', '2026-11-05', 9, { entityId: 'target-1', clicks: 3 }),
                hourly('2026-11-05T22:00:00.000Z', '2026-11-05', 14, { entityId: 'target-2', clicks: 1 }),
            ]);
        await database.db.insert(performanceDaily).values([daily('2026-11-05', { entityId: 'target-1', clicks: 4 }), daily('2026-11-05', { entityId: 'target-daily-only', clicks: 2 })]);

        const results = await refreshDailyTargetPerformance({ database: database.db, accountId: ACCOUNT_ID, countryCode: 'US', now: NOW });

        expect(results.find(result => result.bucketDate === '2026-11-05')).toMatchObject({ outcome: 'kept-daily-report', decision: { reason: 'daily-newer' } });
        expect((await dailyRows(database, ACCOUNT_ID, '2026-11-05')).map(row => [row.entityId, row.clicks])).toEqual([
            ['target-1', 4],
            ['target-daily-only', 2],
        ]);
    });

    it('derives today from the Stream rollup and ignores rollups for other accounts', async () => {
        database = await seedToday();
        await database.db.insert(advertiserAccount).values(account());
        await database.db.insert(amsSpTraffic).values(trafficMessage('ENTITY-TEST', '2026-11-08T06:06:30.000Z'));

        await database.db.insert(jobMetrics).values(rollup(OTHER_ACCOUNT_ID, '2026-11-08T06:05:00.000Z'));
        const withoutOwnRollup = await refreshDailyTargetPerformance({ database: database.db, accountId: ACCOUNT_ID, countryCode: 'US', now: NOW });
        expect(withoutOwnRollup.find(result => result.bucketDate === '2026-11-07')).toMatchObject({ outcome: 'kept-daily-report', decision: { reason: 'no-hourly-data' } });

        await database.db.insert(jobMetrics).values([rollup(ACCOUNT_ID, '2026-11-08T06:00:00.000Z'), rollup(ACCOUNT_ID, '2026-11-08T06:05:00.000Z')]);
        const results = await refreshDailyTargetPerformance({ database: database.db, accountId: ACCOUNT_ID, countryCode: 'US', now: NOW });

        expect(results.find(result => result.bucketDate === '2026-11-07')).toMatchObject({
            outcome: 'derived-from-hourly',
            decision: { reason: 'no-daily-report', streamAsOf: new Date('2026-11-08T06:05:00.000Z') },
        });
        expect(await dailyRows(database, ACCOUNT_ID, '2026-11-07')).toMatchObject([{ bucketStart: '2026-11-07T08:00:00.000Z', entityId: 'target-1', clicks: 3, spend: '1.30' }]);
    });

    it('does not trust a successful rollup when no AMS message arrived for the advertiser in 30 minutes', async () => {
        database = await seedToday();
        await database.db.insert(advertiserAccount).values(account());
        await database.db.insert(jobMetrics).values(rollup(ACCOUNT_ID, '2026-11-08T06:05:00.000Z'));
        await database.db.insert(amsSpTraffic).values([trafficMessage('ENTITY-TEST', '2026-11-08T05:30:00.000Z'), trafficMessage('ENTITY-OTHER', '2026-11-08T06:06:00.000Z', 'other-message')]);
        await database.db.insert(amsSpConversion).values(conversionMessage('ENTITY-TEST', '2026-11-08T05:35:00.000Z'));

        const stale = await refreshDailyTargetPerformance({ database: database.db, accountId: ACCOUNT_ID, countryCode: 'US', now: NOW });
        expect(stale.find(result => result.bucketDate === '2026-11-07')).toMatchObject({ outcome: 'kept-daily-report', decision: { reason: 'no-hourly-data', streamAsOf: null } });
        expect(await dailyRows(database, ACCOUNT_ID, '2026-11-07')).toMatchObject([{ clicks: 1 }]);

        // A conversion message stored within the window is enough; Stream as-of is that arrival.
        await database.db.insert(amsSpConversion).values(conversionMessage('ENTITY-TEST', '2026-11-08T06:01:00.000Z', 'fresh-conversion'));
        const fresh = await refreshDailyTargetPerformance({ database: database.db, accountId: ACCOUNT_ID, countryCode: 'US', now: NOW });
        expect(fresh.find(result => result.bucketDate === '2026-11-07')).toMatchObject({
            outcome: 'derived-from-hourly',
            decision: { streamAsOf: new Date('2026-11-08T06:01:00.000Z') },
        });
    });

    it('never treats an account without an entity id as Stream-fresh', async () => {
        database = await seedToday();
        await database.db.insert(advertiserAccount).values(account({ entityId: null }));
        await database.db.insert(jobMetrics).values(rollup(ACCOUNT_ID, '2026-11-08T06:05:00.000Z'));
        await database.db.insert(amsSpTraffic).values(trafficMessage('ENTITY-TEST', '2026-11-08T06:06:30.000Z'));

        const results = await refreshDailyTargetPerformance({ database: database.db, accountId: ACCOUNT_ID, countryCode: 'US', now: NOW });

        expect(results.map(result => result.outcome)).toEqual(['kept-daily-report', 'kept-daily-report', 'kept-daily-report']);
        expect(await dailyRows(database, ACCOUNT_ID, '2026-11-07')).toMatchObject([{ clicks: 1 }]);
    });

    it('sums all 25 local hours of a fall-back DST date', async () => {
        database = await createTestDatabase();
        const now = new Date('2026-11-02T20:00:00.000Z');
        await database.db
            .insert(reportDatasetMetadata)
            .values([metadata('2026-11-01T07:00:00.000Z', 'daily', '2026-11-02T08:00:30.000Z'), metadata('2026-11-01T07:00:00.000Z', 'hourly', '2026-11-02T11:00:05.000Z')]);
        await database.db.insert(performanceHourly).values([
            hourly('2026-11-01T07:00:00.000Z', '2026-11-01', 0, { clicks: 1 }),
            // 01:00 occurs twice: once in PDT and once in PST.
            hourly('2026-11-01T08:00:00.000Z', '2026-11-01', 1, { clicks: 2 }),
            hourly('2026-11-01T09:00:00.000Z', '2026-11-01', 1, { clicks: 4 }),
            hourly('2026-11-02T07:00:00.000Z', '2026-11-01', 23, { clicks: 8 }),
            hourly('2026-11-02T08:00:00.000Z', '2026-11-02', 0, { clicks: 16 }),
        ]);

        const results = await refreshDailyTargetPerformance({ database: database.db, accountId: ACCOUNT_ID, countryCode: 'US', now });

        expect(results.map(result => [result.bucketDate, result.outcome])).toEqual([
            ['2026-11-02', 'kept-daily-report'],
            ['2026-11-01', 'derived-from-hourly'],
            ['2026-10-31', 'kept-daily-report'],
        ]);
        expect(await dailyRows(database, ACCOUNT_ID, '2026-11-01')).toMatchObject([{ bucketStart: '2026-11-01T07:00:00.000Z', clicks: 15, impressions: 400 }]);
    });

    it('does not erase a daily-filled date when the newer hourly source has no rows', async () => {
        database = await createTestDatabase();
        await database.db
            .insert(reportDatasetMetadata)
            .values([metadata('2026-11-05T08:00:00.000Z', 'daily', '2026-11-06T08:00:14.557Z'), metadata('2026-11-05T08:00:00.000Z', 'hourly', '2026-11-07T08:06:24.957Z')]);
        await database.db.insert(performanceDaily).values(daily('2026-11-05', { entityId: 'target-1', clicks: 4 }));

        const results = await refreshDailyTargetPerformance({ database: database.db, accountId: ACCOUNT_ID, countryCode: 'US', now: NOW });

        expect(results.find(result => result.bucketDate === '2026-11-05')).toMatchObject({ outcome: 'skipped-empty-hourly' });
        expect(await dailyRows(database, ACCOUNT_ID, '2026-11-05')).toMatchObject([{ entityId: 'target-1', clicks: 4 }]);
    });
});

const seedToday = async () => {
    const testDatabase = await createTestDatabase();
    await testDatabase.db.insert(reportDatasetMetadata).values([metadata('2026-11-07T08:00:00.000Z', 'daily', null), metadata('2026-11-07T08:00:00.000Z', 'hourly', null)]);
    await testDatabase.db
        .insert(performanceHourly)
        .values([
            hourly('2026-11-07T15:00:00.000Z', '2026-11-07', 7, { entityId: 'target-1', clicks: 2, spend: '0.90' }),
            hourly('2026-11-08T05:00:00.000Z', '2026-11-07', 21, { entityId: 'target-1', clicks: 1, spend: '0.40' }),
        ]);
    await testDatabase.db.insert(performanceDaily).values(daily('2026-11-07', { entityId: 'target-1', clicks: 1, spend: '0.40' }));
    return testDatabase;
};

const account = (overrides: Partial<Parameters<typeof buildAdvertiserAccount>[0]> = {}) =>
    buildAdvertiserAccount({ adsAccountId: ACCOUNT_ID, countryCode: 'US', entityId: 'ENTITY-TEST', ...overrides });

const amsMessage = (advertiserId: string, receivedAt: string, idempotencyId: string) => ({
    idempotencyId,
    datasetId: 'sp-traffic',
    marketplaceId: 'ATVPDKIKX0DER',
    currency: 'USD',
    advertiserId,
    campaignId: 'campaign-1',
    adGroupId: 'ad-group-1',
    adId: 'ad-1',
    keywordId: 'target-1',
    placement: 'Top of Search on-Amazon',
    timeWindowStart: new Date('2026-11-08T04:00:00.000Z'),
    receivedAt: new Date(receivedAt),
});

const trafficMessage = (advertiserId: string, receivedAt: string, idempotencyId = 'traffic-message') => ({
    ...amsMessage(advertiserId, receivedAt, idempotencyId),
    keywordText: 'deck the palms',
    matchType: 'EXACT',
    clicks: 1,
    impressions: 10,
    cost: 0.4,
});

const conversionMessage = (advertiserId: string, receivedAt: string, idempotencyId = 'conversion-message') => ({
    ...amsMessage(advertiserId, receivedAt, idempotencyId),
    datasetId: 'sp-conversion',
});

const metadata = (periodStart: string, aggregation: 'daily' | 'hourly', lastReportCreatedAt: string | null) =>
    buildReportDatasetMetadata({
        accountId: ACCOUNT_ID,
        periodStart: new Date(periodStart),
        aggregation,
        status: lastReportCreatedAt ? 'completed' : 'missing',
        lastReportCreatedAt: lastReportCreatedAt ? new Date(lastReportCreatedAt) : null,
        reportId: null,
        lastProcessedReportId: lastReportCreatedAt ? `${aggregation}-report` : null,
    });

const hourly = (bucketStart: string, bucketDate: string, bucketHour: number, overrides: Partial<Parameters<typeof buildPerformanceHourly>[0]> = {}) =>
    buildPerformanceHourly({ accountId: ACCOUNT_ID, bucketStart: new Date(bucketStart), bucketDate, bucketHour, ...overrides });

const daily = (bucketDate: string, overrides: Partial<Parameters<typeof buildPerformanceDaily>[0]> = {}) =>
    buildPerformanceDaily({
        accountId: ACCOUNT_ID,
        bucketStart: new Date(`${bucketDate}T08:00:00.000Z`),
        bucketDate,
        entityType: 'target',
        entityId: 'target-1',
        ...overrides,
    });

const rollup = (accountId: string, startedAt: string) => ({
    jobName: 'summarize-hourly-target-stream-for-account',
    bossJobId: `boss-${accountId}-${startedAt}`,
    status: 'succeeded',
    startedAt: new Date(startedAt),
    finishedAt: new Date(startedAt),
    input: { accountId, countryCode: 'US' },
});

const dailyRows = async (database: TestDatabase, accountId: string, bucketDate: string) =>
    (
        await database.db
            .select()
            .from(performanceDaily)
            .where(and(eq(performanceDaily.accountId, accountId), eq(performanceDaily.bucketDate, bucketDate)))
            .orderBy(asc(performanceDaily.entityId))
    ).map(row => ({
        bucketStart: row.bucketStart.toISOString(),
        entityId: row.entityId,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.spend,
        sales: row.sales,
        purchases: row.purchases,
    }));
