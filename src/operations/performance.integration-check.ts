// PGlite database-simulation suite. The `.integration-check.ts` suffix keeps
// this file out of the default Vitest discovery (`vitest.config.ts` includes
// `*.test.ts` only) on purpose: every test here boots a WebAssembly Postgres
// and applies the production migrations, which costs seconds per test and far
// more on a cold CI runner. It runs in the `test:integration` lane instead, via
// `vitest.integration.config.ts`. `bun run check` runs both lanes; the Quality
// workflow runs `check:fast`, the fast lane only. Add new database-backed
// suites with the same suffix — the lane is structural, with no list to keep.
import { afterEach, describe, expect, it } from 'vitest';
import { ad, advertiserAccount, campaign, performanceDaily, reportDatasetMetadata } from '@/db/schema';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { createOperationContext } from './operation-context';
import { performance } from './performance';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';
import { buildAd, buildAdvertiserAccount, buildCampaign, buildPerformanceDaily, buildReportDatasetMetadata } from './testing/fixtures';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';

describe('Performance operation', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
        database = undefined;
    });

    it('returns one complete zero-filled Account series with selected totals and coverage', async () => {
        database = await createTestDatabase();
        await seedAccount(database);
        await database.db.insert(performanceDaily).values([
            buildPerformanceDaily({ bucketStart: new Date('2026-08-05T07:00:00.000Z'), bucketDate: '2026-08-05', entityType: 'target', entityId: 'target-1' }),
            buildPerformanceDaily({
                bucketStart: new Date('2026-08-07T07:00:00.000Z'),
                bucketDate: '2026-08-07',
                entityType: 'target',
                entityId: 'target-1',
                impressions: 50,
                clicks: 5,
                spend: '2.50',
                sales: '10.00',
                purchases: 1,
            }),
        ]);
        await database.db.insert(reportDatasetMetadata).values([metadataFor('2026-08-05'), metadataFor('2026-08-06', { totalRecords: 0, successRecords: 0 }), metadataFor('2026-08-07')]);

        const result = await performance(createContext(database), {
            accountId: ACCOUNT_ID,
            dimension: 'account',
            interval: 'day',
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-07' },
            metrics: ['impressions', 'spend', 'sales', 'roas'],
        });

        expect(result).toEqual({
            context: {
                account: { id: ACCOUNT_ID, timezone: 'America/Los_Angeles', currency: 'USD' },
                dimension: 'account',
                interval: 'day',
                metrics: ['impressions', 'spend', 'sales', 'roas'],
                dateRange: { startDate: '2026-08-05', endDate: '2026-08-07' },
                coverage: { status: 'COMPLETE', issues: [] },
            },
            totals: { impressions: 150, spend: 15, sales: 60, roas: 4 },
            points: [
                { date: '2026-08-05', metrics: { impressions: 100, spend: 12.5, sales: 50, roas: 4 } },
                { date: '2026-08-06', metrics: { impressions: 0, spend: 0, sales: 0, roas: null } },
                { date: '2026-08-07', metrics: { impressions: 50, spend: 2.5, sales: 10, roas: 4 } },
            ],
        });
        expect('nextCursor' in result).toBe(false);
        expect('complete' in result).toBe(false);
    });

    it('returns bounded Product series in request order and preserves zero-activity Products', async () => {
        database = await createTestDatabase();
        await seedAccount(database);
        await database.db.insert(ad).values(buildAd({ productAsin: 'B0PRODUCT01' }));
        await database.db
            .insert(performanceDaily)
            .values(buildPerformanceDaily({ bucketStart: new Date('2026-08-05T07:00:00.000Z'), bucketDate: '2026-08-05', entityType: 'target', entityId: 'target-1' }));

        const result = await performance(createContext(database), {
            accountId: ACCOUNT_ID,
            dimension: 'product',
            entityIds: ['B0MISSING01', 'b0product01'],
            interval: 'day',
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-06' },
            metrics: ['orders', 'cvr'],
        });

        expect(result.context.dimension).toBe('product');
        if (!('series' in result)) {
            throw new Error('Expected Product Performance result.');
        }
        expect(result.series).toEqual([
            {
                entityId: 'B0MISSING01',
                totals: { orders: 0, cvr: null },
                points: [
                    { date: '2026-08-05', metrics: { orders: 0, cvr: null } },
                    { date: '2026-08-06', metrics: { orders: 0, cvr: null } },
                ],
            },
            {
                entityId: 'B0PRODUCT01',
                totals: { orders: 2, cvr: 20 },
                points: [
                    { date: '2026-08-05', metrics: { orders: 2, cvr: 20 } },
                    { date: '2026-08-06', metrics: { orders: 0, cvr: null } },
                ],
            },
        ]);
    });

    it('groups exact Ad and Target series independently, preserves input order, and isolates the Account', async () => {
        database = await createTestDatabase();
        await seedAccount(database);
        await database.db.insert(performanceDaily).values([
            buildPerformanceDaily({ entityType: 'target', entityId: 'target-1', adId: 'ad-1' }),
            buildPerformanceDaily({ entityType: 'target', entityId: 'target-2', adId: 'ad-1', impressions: 50, clicks: 5, spend: '2.50', sales: '10.00', purchases: 1 }),
            buildPerformanceDaily({ entityType: 'target', entityId: 'target-3', adId: 'ad-2', impressions: 20, clicks: 2, spend: '4.00', sales: '0.00', purchases: 0 }),
            buildPerformanceDaily({
                accountId: 'ads-account-2',
                entityType: 'target',
                entityId: 'target-1',
                adId: 'ad-1',
                impressions: 999,
                clicks: 999,
                spend: '999.00',
                sales: '999.00',
                purchases: 999,
            }),
        ]);

        const adResult = await performance(createContext(database), {
            accountId: ACCOUNT_ID,
            dimension: 'ad',
            entityIds: ['ad-2', 'ad-missing', 'ad-1'],
            interval: 'day',
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-06' },
            metrics: ['impressions', 'clicks', 'spend', 'orders', 'sales', 'cvr', 'roas'],
        });
        if (!('series' in adResult)) {
            throw new Error('Expected Ad Performance result.');
        }
        expect(adResult.series.map(series => series.entityId)).toEqual(['ad-2', 'ad-missing', 'ad-1']);
        expect(adResult.series[0]).toMatchObject({
            totals: { impressions: 20, clicks: 2, spend: 4, orders: 0, sales: 0, cvr: 0, roas: 0 },
            points: [
                { date: '2026-08-05', metrics: { impressions: 20, clicks: 2, spend: 4, orders: 0, sales: 0, cvr: 0, roas: 0 } },
                { date: '2026-08-06', metrics: { impressions: 0, clicks: 0, spend: 0, orders: 0, sales: 0, cvr: null, roas: null } },
            ],
        });
        expect(adResult.series[1]?.totals).toEqual({ impressions: 0, clicks: 0, spend: 0, orders: 0, sales: 0, cvr: null, roas: null });
        expect(adResult.series[2]?.totals).toEqual({ impressions: 150, clicks: 15, spend: 15, orders: 3, sales: 60, cvr: 20, roas: 4 });

        const targetResult = await performance(createContext(database), {
            accountId: ACCOUNT_ID,
            dimension: 'target',
            entityIds: ['target-2', 'target-1'],
            interval: 'day',
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-05' },
            metrics: ['impressions', 'spend', 'orders', 'cvr'],
        });
        if (!('series' in targetResult)) {
            throw new Error('Expected Target Performance result.');
        }
        expect(targetResult.series).toEqual([
            {
                entityId: 'target-2',
                totals: { impressions: 50, spend: 2.5, orders: 1, cvr: 20 },
                points: [{ date: '2026-08-05', metrics: { impressions: 50, spend: 2.5, orders: 1, cvr: 20 } }],
            },
            {
                entityId: 'target-1',
                totals: { impressions: 100, spend: 12.5, orders: 2, cvr: 20 },
                points: [{ date: '2026-08-05', metrics: { impressions: 100, spend: 12.5, orders: 2, cvr: 20 } }],
            },
        ]);
    });

    it('keeps bounded Target hourly points unambiguous across DST fall-back', async () => {
        database = await createTestDatabase();
        await seedAccount(database);

        const result = await performance(createContext(database), {
            accountId: ACCOUNT_ID,
            dimension: 'target',
            entityIds: ['target-1'],
            interval: 'hour',
            dateRange: { startDate: '2026-11-01', endDate: '2026-11-01' },
            metrics: ['spend'],
        });

        if (!('series' in result)) {
            throw new Error('Expected Target Performance result.');
        }
        expect(result.series[0]?.points).toHaveLength(25);
        expect(new Set(result.series[0]?.points.map(point => ('start' in point ? point.start : ''))).size).toBe(25);
    });

    it('rejects exact cardinality overflow before reading performance rows', async () => {
        database = await createTestDatabase();
        await seedAccount(database);
        const entityIds = Array.from({ length: 25 }, (_, index) => `target-${index}`);
        let beganQuery = false;

        await expect(
            performance(
                createContext(database),
                {
                    accountId: ACCOUNT_ID,
                    dimension: 'target',
                    entityIds,
                    interval: 'day',
                    dateRange: { startDate: '2026-01-01', endDate: '2026-07-20' },
                    metrics: ['spend'],
                },
                {
                    beforeQuery: async () => {
                        beganQuery = true;
                    },
                }
            )
        ).rejects.toMatchObject({
            code: 'RESULT_TOO_LARGE',
            details: { estimatedPoints: 5025, maxPoints: 5000, dimensions: { dimension: 'target', interval: 'day', entities: 25 } },
        });
        expect(beganQuery).toBe(false);

        await expect(
            performance(createContext(database), {
                accountId: ACCOUNT_ID,
                dimension: 'target',
                entityIds,
                interval: 'day',
                dateRange: { startDate: '2025-01-01', endDate: '2026-02-05' },
                metrics: ['spend'],
            })
        ).rejects.toMatchObject({ code: 'RESULT_TOO_LARGE', details: { maxPoints: 5000 } });
    });

    it('accepts the exact 5,000-point boundary and groups daily observations into calendar months', async () => {
        database = await createTestDatabase();
        await seedAccount(database);
        const entityIds = Array.from({ length: 25 }, (_, index) => `B0${String(index).padStart(8, '0')}`);

        const boundary = await performance(createContext(database), {
            accountId: ACCOUNT_ID,
            dimension: 'product',
            entityIds,
            interval: 'day',
            dateRange: { startDate: '2026-01-01', endDate: '2026-07-19' },
            metrics: ['spend'],
        });
        if (!('series' in boundary)) {
            throw new Error('Expected Product Performance result.');
        }
        expect(boundary.series).toHaveLength(25);
        expect(boundary.series.reduce((count, series) => count + series.points.length, 0)).toBe(5000);

        await database.db
            .insert(performanceDaily)
            .values(buildPerformanceDaily({ bucketStart: new Date('2026-02-15T08:00:00.000Z'), bucketDate: '2026-02-15', entityType: 'target', entityId: 'target-1', spend: '3.00' }));
        const monthly = await performance(createContext(database), {
            accountId: ACCOUNT_ID,
            dimension: 'account',
            interval: 'month',
            dateRange: { startDate: '2026-01-20', endDate: '2026-03-10' },
            metrics: ['spend'],
        });
        if (!('points' in monthly)) {
            throw new Error('Expected Account Performance result.');
        }
        expect(monthly.points).toEqual([
            { month: '2026-01', metrics: { spend: 0 } },
            { month: '2026-02', metrics: { spend: 3 } },
            { month: '2026-03', metrics: { spend: 0 } },
        ]);
    });

    it('reports incomplete coverage, authorization failures, and post-query byte limits separately', async () => {
        database = await createTestDatabase();
        await seedAccount(database);
        await database.db.insert(reportDatasetMetadata).values(metadataFor('2026-08-05', { status: 'failed' }));

        const result = await performance(createContext(database), {
            accountId: ACCOUNT_ID,
            dimension: 'account',
            interval: 'day',
            dateRange: { startDate: '2026-08-05', endDate: '2026-08-06' },
            metrics: ['spend'],
        });
        expect(result.context.coverage).toEqual({
            status: 'INCOMPLETE',
            issues: [
                { date: '2026-08-05', status: 'FAILED' },
                { date: '2026-08-06', status: 'UNKNOWN' },
            ],
        });

        await expect(
            performance(createContext(database, []), {
                accountId: ACCOUNT_ID,
                dimension: 'account',
                interval: 'day',
                dateRange: { startDate: '2026-08-05', endDate: '2026-08-05' },
                metrics: ['spend'],
            })
        ).rejects.toMatchObject({ code: 'ACCOUNT_ACCESS_DENIED' });

        await expect(
            performance(createContext(database), {
                accountId: ACCOUNT_ID,
                dimension: 'ad',
                interval: 'day',
                dateRange: { startDate: '2026-08-05', endDate: '2026-08-05' },
                metrics: ['spend'],
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

        await expect(
            performance(createContext(database), {
                accountId: ACCOUNT_ID,
                dimension: 'account',
                entityIds: ['ad-1'],
                interval: 'day',
                dateRange: { startDate: '2026-08-05', endDate: '2026-08-05' },
                metrics: ['spend'],
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

        await expect(
            performance(
                createContext(database),
                {
                    accountId: ACCOUNT_ID,
                    dimension: 'account',
                    interval: 'day',
                    dateRange: { startDate: '2026-08-05', endDate: '2026-08-05' },
                    metrics: ['spend'],
                },
                { maxResponseBytes: 1 }
            )
        ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE', details: { maxResponseBytes: 1 } });

        await expect(
            performance(
                createContext(database),
                {
                    accountId: ACCOUNT_ID,
                    dimension: 'account',
                    interval: 'day',
                    dateRange: { startDate: '2026-08-05', endDate: '2026-08-05' },
                    metrics: ['spend'],
                },
                { beforeQuery: () => new Promise(resolve => setTimeout(resolve, 20)), timeoutMs: 1 }
            )
        ).rejects.toMatchObject({ code: 'EXECUTION_TIMEOUT', details: { timeoutMs: 1 } });
    });
});

const seedAccount = async (database: TestDatabase) => {
    await database.db.insert(advertiserAccount).values(buildAdvertiserAccount());
    await database.db.insert(campaign).values(buildCampaign());
};

const metadataFor = (date: string, overrides: Partial<ReturnType<typeof buildReportDatasetMetadata>> = {}) =>
    buildReportDatasetMetadata({ periodStart: new Date(`${date}T07:00:00.000Z`), reportId: `report-${date}`, lastProcessedReportId: `report-${date}`, ...overrides });

const createContext = (database: TestDatabase, accessibleAccountIds: string[] = [ACCOUNT_ID]) =>
    createOperationContext({
        amazonAds: createFakeAmazonAdsGateway(),
        db: database.db,
        principal: { accessibleAccountIds, credentialKind: 'session', merchbaseUserId: 'user-1' },
    });
