import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dailyPlacementReportConfig } from '@/config/reports/daily-placement';
import { performanceDailyPlacement, reportDatasetMetadata } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/operations/testing/create-test-database';
import { handleDailyPlacement } from './daily-placement';

describe('daily Campaign placement report ingestion', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        vi.restoreAllMocks();
        await database?.close();
        database = undefined;
    });

    it('writes the dedicated Campaign/date/placement projection idempotently', async () => {
        database = await createTestDatabase();
        const periodStart = new Date('2026-08-06T07:00:00.000Z');
        const [metadata] = await database.db
            .insert(reportDatasetMetadata)
            .values({
                accountId: 'placement-ads-account-1',
                countryCode: 'US',
                periodStart,
                aggregation: 'daily',
                entityType: 'placement',
                status: 'parsing',
                refreshing: false,
                totalRecords: 0,
                successRecords: 0,
                errorRecords: 0,
                nextRefreshAt: null,
                lastReportCreatedAt: null,
                reportId: 'placement-report-1',
                lastProcessedReportId: null,
                error: null,
            })
            .returning({ uid: reportDatasetMetadata.uid });

        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async () =>
                new Response(
                    gzipSync(
                        JSON.stringify([
                            {
                                'date.value': '2026-08-06',
                                'campaign.id': 'campaign-placement-1',
                                'placement.value': 'TOP_OF_SEARCH',
                                'metric.impressions': 100,
                                'metric.clicks': 10,
                                'metric.purchases': 2,
                                'metric.sales': 40,
                                'metric.totalCost': 10,
                            },
                            {
                                'date.value': '2026-08-06',
                                'campaign.id': 'campaign-placement-1',
                                'placement.value': 'PRODUCT_PAGE',
                                'metric.impressions': 50,
                                'metric.clicks': 5,
                                'metric.purchases': 1,
                                'metric.sales': 15,
                                'metric.totalCost': 5,
                            },
                            {
                                'date.value': '2026-08-06',
                                'campaign.id': 'campaign-placement-1',
                                'placement.value': 'UNMAPPED_SOURCE_PLACEMENT',
                                'metric.impressions': 1,
                                'metric.clicks': 1,
                                'metric.purchases': 0,
                                'metric.sales': 0,
                                'metric.totalCost': 0,
                            },
                        ])
                    ),
                    { status: 200 }
                )
        );

        const input = {
            reportUid: metadata.uid,
            accountId: 'placement-ads-account-1',
            periodStart,
            countryCode: 'US',
            reportConfig: dailyPlacementReportConfig,
            reportUrl: 'https://reports.example/placement-report.gz',
        };

        await expect(handleDailyPlacement(input, database.db)).resolves.toMatchObject({ rowsProcessed: 3, successCount: 2, changedCount: 2, errorCount: 1 });
        await expect(handleDailyPlacement(input, database.db)).resolves.toMatchObject({ rowsProcessed: 3, successCount: 2, changedCount: 0, errorCount: 1 });

        await expect(database.db.select().from(performanceDailyPlacement)).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    accountId: 'placement-ads-account-1',
                    bucketDate: '2026-08-06',
                    campaignId: 'campaign-placement-1',
                    placement: 'TOP_OF_SEARCH',
                    impressions: 100,
                    clicks: 10,
                    spend: '10.00',
                    sales: '40.00',
                    purchases: 2,
                }),
                expect.objectContaining({
                    accountId: 'placement-ads-account-1',
                    bucketDate: '2026-08-06',
                    campaignId: 'campaign-placement-1',
                    placement: 'PRODUCT_PAGE',
                    impressions: 50,
                    clicks: 5,
                    spend: '5.00',
                    sales: '15.00',
                    purchases: 1,
                }),
            ])
        );

        const [updatedMetadata] = await database.db.select().from(reportDatasetMetadata);
        expect(updatedMetadata).toMatchObject({ totalRecords: 3, successRecords: 2, errorRecords: 1 });
    });

    it('aggregates normalized aliases and removes rows absent from a clean authoritative refresh', async () => {
        database = await createTestDatabase();
        const periodStart = new Date('2026-08-06T07:00:00.000Z');
        const [metadata] = await database.db
            .insert(reportDatasetMetadata)
            .values({
                accountId: 'placement-ads-account-1',
                countryCode: 'US',
                periodStart,
                aggregation: 'daily',
                entityType: 'placement',
                status: 'parsing',
                reportId: 'placement-report-2',
            })
            .returning({ uid: reportDatasetMetadata.uid });
        let reportRows = [
            buildPlacementReportRow({ 'placement.value': 'REST_OF_SEARCH', 'metric.impressions': 20, 'metric.clicks': 2, 'metric.totalCost': 2 }),
            buildPlacementReportRow({
                'placement.value': 'OTHER_ON_AMAZON',
                'metric.impressions': 30,
                'metric.clicks': 3,
                'metric.totalCost': 3,
                'metric.purchases': 2,
                'metric.sales': 20,
            }),
            buildPlacementReportRow({ 'placement.value': 'PRODUCT_PAGE', 'metric.impressions': 10, 'metric.clicks': 1, 'metric.totalCost': 1 }),
        ];
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(gzipSync(JSON.stringify(reportRows)), { status: 200 }));

        const input = {
            reportUid: metadata.uid,
            accountId: 'placement-ads-account-1',
            periodStart,
            countryCode: 'US',
            reportUrl: 'https://reports.example/placement-report.gz',
        };

        await expect(handleDailyPlacement(input, database.db)).resolves.toMatchObject({ rowsProcessed: 3, successCount: 3, changedCount: 2, errorCount: 0 });

        reportRows = [
            buildPlacementReportRow({
                'placement.value': 'REST_OF_SEARCH',
                'metric.impressions': 50,
                'metric.clicks': 5,
                'metric.totalCost': 5,
                'metric.purchases': 3,
                'metric.sales': 30,
            }),
        ];

        await expect(handleDailyPlacement(input, database.db)).resolves.toMatchObject({ rowsProcessed: 1, successCount: 1, changedCount: 1, errorCount: 0 });
        await expect(database.db.select().from(performanceDailyPlacement)).resolves.toEqual([
            expect.objectContaining({
                placement: 'REST_OF_SEARCH',
                impressions: 50,
                clicks: 5,
                spend: '5.00',
                sales: '30.00',
                purchases: 3,
            }),
        ]);
    });

    it('stores marketplace-specific report metadata for the same Amazon account and date', async () => {
        database = await createTestDatabase();
        const periodStart = new Date('2026-08-06T07:00:00.000Z');

        await database.db.insert(reportDatasetMetadata).values([
            {
                accountId: 'placement-multi-market-account',
                countryCode: 'US',
                periodStart,
                aggregation: 'daily',
                entityType: 'placement',
                status: 'completed',
            },
            {
                accountId: 'placement-multi-market-account',
                countryCode: 'CA',
                periodStart,
                aggregation: 'daily',
                entityType: 'placement',
                status: 'completed',
            },
        ]);

        await expect(database.db.select().from(reportDatasetMetadata)).resolves.toHaveLength(2);
    });
});

const buildPlacementReportRow = (overrides: Record<string, string | number> = {}) => ({
    'date.value': '2026-08-06',
    'campaign.id': 'campaign-placement-1',
    'placement.value': 'TOP_OF_SEARCH',
    'metric.impressions': 10,
    'metric.clicks': 1,
    'metric.purchases': 1,
    'metric.sales': 10,
    'metric.totalCost': 1,
    ...overrides,
});
