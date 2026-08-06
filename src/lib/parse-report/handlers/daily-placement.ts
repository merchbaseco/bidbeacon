import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { formatInTimeZone } from 'date-fns-tz';
import { and, eq, or, sql } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { z } from 'zod';
import { dailyPlacementReportRowSchema } from '@/config/reports/daily-placement';
import type { Database } from '@/db/index';
import { withDatabaseRetry } from '@/db/retry';
import { performanceDailyPlacement, reportDatasetMetadata } from '@/db/schema';
import { normalizePlacement } from '@/lib/placement-report/normalize-placement';
import type { operationSchema } from '@/operations/operation-schema';
import { emitEvent } from '@/utils/events';
import { getTimezoneForCountry } from '@/utils/timezones';
import { parseDailyTimestamp } from '../utils/parse-period-start-timestamp';
import type { ParseReportOutput } from './input';

const gunzipAsync = promisify(gunzip);
const WRITE_BATCH_SIZE = 1000;
const DELETE_BATCH_SIZE = 500;

export type DailyPlacementReportInput = {
    reportUid: string;
    accountId: string;
    periodStart: Date;
    countryCode: string;
    reportUrl: string;
};

type PlacementDatabase = Database | PgliteDatabase<typeof operationSchema>;

export const handleDailyPlacement = async (input: DailyPlacementReportInput, database?: PlacementDatabase): Promise<ParseReportOutput> => {
    const databaseClient = (database ?? (await import('@/db/index')).db) as Database;
    const timezone = getTimezoneForCountry(input.countryCode);
    const response = await fetch(input.reportUrl, {
        signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
        throw new Error(`Failed to download placement report: ${response.status} ${response.statusText}`);
    }

    const compressedData = await response.arrayBuffer();
    const decompressedData = await gunzipAsync(Buffer.from(compressedData));
    const rows = z.array(dailyPlacementReportRowSchema).parse(JSON.parse(decompressedData.toString()));

    const expectedBucketDate = formatInTimeZone(input.periodStart, timezone, 'yyyy-MM-dd');
    const normalizedRows = new Map<string, NormalizedPlacementRow>();
    const errors: string[] = [];
    let successCount = 0;

    for (const row of rows) {
        try {
            const placement = normalizePlacement(row['placement.value']);
            const { bucketStart, bucketDate } = parseDailyTimestamp(row['date.value'], timezone);
            if (bucketDate !== expectedBucketDate) {
                throw new Error(`Unexpected placement report date: ${bucketDate}; expected ${expectedBucketDate}`);
            }

            const key = getPlacementKey(row['campaign.id'], placement);
            const existing = normalizedRows.get(key);
            if (existing) {
                existing.impressions += row['metric.impressions'];
                existing.clicks += row['metric.clicks'];
                existing.spend += row['metric.totalCost'];
                existing.sales += row['metric.sales'];
                existing.purchases += row['metric.purchases'];
            } else {
                normalizedRows.set(key, {
                    campaignId: row['campaign.id'],
                    placement,
                    bucketDate,
                    bucketStart,
                    impressions: row['metric.impressions'],
                    clicks: row['metric.clicks'],
                    spend: row['metric.totalCost'],
                    sales: row['metric.sales'],
                    purchases: row['metric.purchases'],
                });
            }
            successCount += 1;
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
    }

    const valuesToInsert: (typeof performanceDailyPlacement.$inferInsert)[] = [...normalizedRows.values()]
        .map(row => ({
            accountId: input.accountId,
            countryCode: input.countryCode,
            bucketStart: row.bucketStart,
            bucketDate: row.bucketDate,
            campaignId: row.campaignId,
            placement: row.placement,
            impressions: row.impressions,
            clicks: row.clicks,
            spend: String(row.spend),
            sales: String(row.sales),
            purchases: row.purchases,
        }))
        .sort((left, right) => [left.bucketDate, left.campaignId, left.placement].join('|').localeCompare([right.bucketDate, right.campaignId, right.placement].join('|')));

    const { changedCount, updatedRow } = await withDatabaseRetry(() =>
        databaseClient.transaction(async transaction => {
            let changedCount = 0;
            if (errors.length === 0) {
                const existingRows = await transaction
                    .select({
                        campaignId: performanceDailyPlacement.campaignId,
                        placement: performanceDailyPlacement.placement,
                    })
                    .from(performanceDailyPlacement)
                    .where(
                        and(
                            eq(performanceDailyPlacement.accountId, input.accountId),
                            eq(performanceDailyPlacement.countryCode, input.countryCode),
                            eq(performanceDailyPlacement.bucketDate, expectedBucketDate)
                        )
                    );
                const incomingKeys = new Set(valuesToInsert.map(row => getPlacementKey(row.campaignId, row.placement)));
                const staleRows = existingRows.filter(row => !incomingKeys.has(getPlacementKey(row.campaignId, row.placement)));
                for (let offset = 0; offset < staleRows.length; offset += DELETE_BATCH_SIZE) {
                    const batch = staleRows.slice(offset, offset + DELETE_BATCH_SIZE);
                    const deletedRows = await transaction
                        .delete(performanceDailyPlacement)
                        .where(
                            and(
                                eq(performanceDailyPlacement.accountId, input.accountId),
                                eq(performanceDailyPlacement.countryCode, input.countryCode),
                                eq(performanceDailyPlacement.bucketDate, expectedBucketDate),
                                or(...batch.map(row => and(eq(performanceDailyPlacement.campaignId, row.campaignId), eq(performanceDailyPlacement.placement, row.placement))))
                            )
                        )
                        .returning({ campaignId: performanceDailyPlacement.campaignId });
                    changedCount += deletedRows.length;
                }
            }

            for (let offset = 0; offset < valuesToInsert.length; offset += WRITE_BATCH_SIZE) {
                const batch = valuesToInsert.slice(offset, offset + WRITE_BATCH_SIZE);
                const changedRows = await transaction
                    .insert(performanceDailyPlacement)
                    .values(batch)
                    .onConflictDoUpdate({
                        target: [
                            performanceDailyPlacement.accountId,
                            performanceDailyPlacement.countryCode,
                            performanceDailyPlacement.bucketDate,
                            performanceDailyPlacement.campaignId,
                            performanceDailyPlacement.placement,
                        ],
                        set: {
                            bucketStart: sql`excluded.bucket_start`,
                            impressions: sql`excluded.impressions`,
                            clicks: sql`excluded.clicks`,
                            spend: sql`excluded.spend`,
                            sales: sql`excluded.sales`,
                            purchases: sql`excluded.purchases`,
                        },
                        setWhere: sql`(
                            ${performanceDailyPlacement.bucketStart},
                            ${performanceDailyPlacement.impressions},
                            ${performanceDailyPlacement.clicks},
                            ${performanceDailyPlacement.spend},
                            ${performanceDailyPlacement.sales},
                            ${performanceDailyPlacement.purchases}
                        ) IS DISTINCT FROM (
                            excluded.bucket_start,
                            excluded.impressions,
                            excluded.clicks,
                            excluded.spend,
                            excluded.sales,
                            excluded.purchases
                        )`,
                    })
                    .returning({ accountId: performanceDailyPlacement.accountId });
                changedCount += changedRows.length;
            }

            const [updatedRow] = await transaction
                .update(reportDatasetMetadata)
                .set({ totalRecords: rows.length, successRecords: successCount, errorRecords: errors.length })
                .where(eq(reportDatasetMetadata.uid, input.reportUid))
                .returning();

            return { changedCount, updatedRow };
        })
    );

    if (updatedRow) {
        emitEvent({ type: 'report:refreshed', row: updatedRow });
    }

    return {
        rowsProcessed: rows.length,
        successCount,
        changedCount,
        errorCount: errors.length,
        errorSamples: [...new Set(errors)].slice(0, 5),
    };
};

type NormalizedPlacementRow = {
    campaignId: string;
    placement: string;
    bucketDate: string;
    bucketStart: Date;
    impressions: number;
    clicks: number;
    spend: number;
    sales: number;
    purchases: number;
};

const getPlacementKey = (campaignId: string, placement: string) => `${campaignId}\u0000${placement}`;
