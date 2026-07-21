import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { dailyReportRowSchema } from '@/config/reports/daily-target';
import { db } from '@/db/index';
import { withDatabaseRetry } from '@/db/retry';
import { performanceDaily, reportDatasetMetadata } from '@/db/schema';
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
            errors.push({
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const BATCH_SIZE = 1000;
    let insertedCount = 0;
    let changedCount = 0;

    // Set total upfront so progress bar starts at 0%
    await updateProgress(input.reportUid, valuesToInsert.length, 0, errors.length);
    valuesToInsert.sort((left, right) =>
        [left.bucketDate, left.adId, left.entityType, left.entityId].join('|').localeCompare([right.bucketDate, right.adId, right.entityType, right.entityId].join('|'))
    );

    for (let i = 0; i < valuesToInsert.length; i += BATCH_SIZE) {
        const batch = valuesToInsert.slice(i, i + BATCH_SIZE);
        const changedRows = await withDatabaseRetry(() =>
            db
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
                .returning({ accountId: performanceDaily.accountId })
        );

        changedCount += changedRows.length;

        insertedCount += batch.length;
        await updateProgress(input.reportUid, valuesToInsert.length, insertedCount, errors.length);
    }

    return {
        successCount: valuesToInsert.length,
        changedCount,
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
