import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { formatInTimeZone } from 'date-fns-tz';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { dailyReportRowSchema } from '@/config/reports/daily-target';
import { db } from '@/db/index';
import { withDatabaseRetry } from '@/db/retry';
import { performanceDaily, reportDatasetMetadata } from '@/db/schema';
import { lockDailyTargetDate } from '@/lib/daily-target-freshness/refresh-daily-target-performance';
import { emitEvent } from '@/utils/events';
import { getTimezoneForCountry } from '@/utils/timezones';
import { parseDailyTimestamp } from '../utils/parse-period-start-timestamp';
import { TargetCache } from '../utils/target-cache';
import type { ParseReportInput, ParseReportOutput } from './input';

const gunzipAsync = promisify(gunzip);

export async function handleDailyTarget(input: ParseReportInput): Promise<ParseReportOutput> {
    const timezone = getTimezoneForCountry(input.countryCode);

    const response = await fetch(input.reportUrl, {
        signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
        throw new Error(`Failed to download report: ${response.status} ${response.statusText}`);
    }

    const compressedData = await response.arrayBuffer();
    const decompressedData = await gunzipAsync(Buffer.from(compressedData));

    const rawJson = JSON.parse(decompressedData.toString());
    const rows = z.array(dailyReportRowSchema).parse(rawJson);

    const uniqueAdGroupIds = [...new Set(rows.map(r => r['adGroup.id']))];
    const targetCache = await TargetCache.build(uniqueAdGroupIds);

    const valuesToInsert: (typeof performanceDaily.$inferInsert)[] = [];
    const errors: { error: string }[] = [];
    const errorAdIds: string[] = [];

    for (const row of rows) {
        try {
            const entityId = targetCache.getTargetId(row['adGroup.id'], row['target.value'], row['target.matchType']);
            const { bucketStart, bucketDate } = parseDailyTimestamp(row['date.value'], timezone);

            valuesToInsert.push({
                accountId: input.accountId,
                bucketStart,
                bucketDate,
                campaignId: row['campaign.id'],
                adGroupId: row['adGroup.id'],
                adId: row['ad.id'],
                entityType: input.reportConfig.entityType,
                entityId,
                impressions: row['metric.impressions'],
                clicks: row['metric.clicks'],
                spend: String(row['metric.totalCost']),
                sales: String(row['metric.sales']),
                purchases: row['metric.purchases'],
            });
        } catch (error) {
            errorAdIds.push(row['ad.id']);
            errors.push({
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const BATCH_SIZE = 1000;
    const bucketDate = formatInTimeZone(input.periodStart, timezone, 'yyyy-MM-dd');
    const erroredAdIds = [...new Set(errorAdIds)];

    // Set total upfront so progress bar starts at 0%
    await updateProgress(input.reportUid, valuesToInsert.length, 0, errors.length);
    valuesToInsert.sort((left, right) =>
        [left.bucketDate, left.adId, left.entityType, left.entityId].join('|').localeCompare([right.bucketDate, right.adId, right.entityType, right.entityId].join('|'))
    );

    // One transaction per report date: readers never see a half-replaced day, and the hourly
    // derivation (which takes the same date lock) cannot interleave with the report's rows.
    const { changedCount, removedCount } = await withDatabaseRetry(() =>
        db.transaction(async tx => {
            await lockDailyTargetDate(tx, input.accountId, bucketDate);
            let changed = 0;

            for (let i = 0; i < valuesToInsert.length; i += BATCH_SIZE) {
                const batch = valuesToInsert.slice(i, i + BATCH_SIZE);
                const changedRows = await tx
                    .insert(performanceDaily)
                    .values(batch)
                    .onConflictDoUpdate({
                        target: [performanceDaily.accountId, performanceDaily.bucketDate, performanceDaily.adId, performanceDaily.entityType, performanceDaily.entityId],
                        set: {
                            campaignId: sql`excluded.campaign_id`,
                            adGroupId: sql`excluded.ad_group_id`,
                            impressions: sql`excluded.impressions`,
                            clicks: sql`excluded.clicks`,
                            spend: sql`excluded.spend`,
                            sales: sql`excluded.sales`,
                            purchases: sql`excluded.purchases`,
                        },
                        setWhere: sql`(
                            ${performanceDaily.campaignId},
                            ${performanceDaily.adGroupId},
                            ${performanceDaily.impressions},
                            ${performanceDaily.clicks},
                            ${performanceDaily.spend},
                            ${performanceDaily.sales},
                            ${performanceDaily.purchases}
                        ) IS DISTINCT FROM (
                            excluded.campaign_id,
                            excluded.ad_group_id,
                            excluded.impressions,
                            excluded.clicks,
                            excluded.spend,
                            excluded.sales,
                            excluded.purchases
                        )`,
                    })
                    .returning({ accountId: performanceDaily.accountId });

                changed += changedRows.length;
            }

            // The daily report is the whole date: drop rows it no longer contains (for example, targets
            // an earlier hourly derivation added). An empty report is treated as suspect and removes
            // nothing, and rows for ads whose report rows failed target lookup are kept.
            const removed =
                valuesToInsert.length === 0
                    ? []
                    : await tx
                          .delete(performanceDaily)
                          .where(
                              and(
                                  eq(performanceDaily.accountId, input.accountId),
                                  eq(performanceDaily.bucketDate, bucketDate),
                                  eq(performanceDaily.entityType, input.reportConfig.entityType),
                                  erroredAdIds.length > 0 ? notInArray(performanceDaily.adId, erroredAdIds) : undefined,
                                  sql`NOT EXISTS (
                                      SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(valuesToInsert.map(row => ({ ad_id: row.adId, entity_id: row.entityId, bucket_date: row.bucketDate })))}::jsonb)
                                          AS report_row(ad_id text, entity_id text, bucket_date date)
                                      WHERE report_row.ad_id = ${performanceDaily.adId}
                                          AND report_row.entity_id = ${performanceDaily.entityId}
                                          AND report_row.bucket_date = ${performanceDaily.bucketDate}
                                  )`
                              )
                          )
                          .returning({ accountId: performanceDaily.accountId });

            return { changedCount: changed + removed.length, removedCount: removed.length };
        })
    );
    await updateProgress(input.reportUid, valuesToInsert.length, valuesToInsert.length, errors.length);

    return {
        successCount: valuesToInsert.length,
        changedCount,
        removedCount,
        errorCount: errors.length,
        rowsProcessed: valuesToInsert.length + errors.length,
        errorSamples: [...new Set(errors.map(error => error.error))].slice(0, 5),
    };
}

async function updateProgress(reportUid: string, totalRecords: number, successRecords: number, errorRecords: number) {
    const [updatedRow] = await db.update(reportDatasetMetadata).set({ totalRecords, successRecords, errorRecords }).where(eq(reportDatasetMetadata.uid, reportUid)).returning();
    emitEvent({
        type: 'report:refreshed',
        row: updatedRow,
    });
}
