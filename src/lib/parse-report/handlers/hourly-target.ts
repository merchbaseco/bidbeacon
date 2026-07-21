import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { hourlyReportRowSchema } from '@/config/reports/hourly-target';
import { db } from '@/db/index';
import { withDatabaseRetry } from '@/db/retry';
import { performanceHourly, reportDatasetMetadata } from '@/db/schema';
import { getHourlyStreamOwnershipStart } from '@/utils/date';
import { emitEvent } from '@/utils/events';
import { getTimezoneForCountry } from '@/utils/timezones';
import { normalizeHourlyValue, parseHourlyTimestamp } from '../utils/parse-period-start-timestamp';
import { TargetCache } from '../utils/target-cache';
import type { ParseReportInput, ParseReportOutput } from './input';

const gunzipAsync = promisify(gunzip);

export async function handleHourlyTarget(input: ParseReportInput): Promise<ParseReportOutput> {
    const timezone = getTimezoneForCountry(input.countryCode);
    const streamOwnershipCutoff = getHourlyStreamOwnershipStart(new Date(), timezone);

    const response = await fetch(input.reportUrl, {
        signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
        throw new Error(`Failed to download report: ${response.status} ${response.statusText}`);
    }

    const compressedData = await response.arrayBuffer();
    const decompressedData = await gunzipAsync(Buffer.from(compressedData));

    const rawJson = JSON.parse(decompressedData.toString());
    const rows = z.array(hourlyReportRowSchema).parse(rawJson);

    // Pre-fetch all targets for batch lookup
    const uniqueAdGroupIds = [...new Set(rows.map(r => r['adGroup.id']))];
    const targetCache = await TargetCache.build(uniqueAdGroupIds);

    // Build insert values, tracking any target lookup errors
    const valuesToInsert: (typeof performanceHourly.$inferInsert)[] = [];
    const errors: { error: string }[] = [];
    let streamOwnedRows = 0;

    for (const row of rows) {
        try {
            const normalizedHourValue = normalizeHourlyValue(row['hour.value'], row['date.value']);
            const { bucketStart, bucketDate, bucketHour } = parseHourlyTimestamp(normalizedHourValue, timezone);

            if (bucketStart >= streamOwnershipCutoff) {
                streamOwnedRows += 1;
                continue;
            }

            const entityId = targetCache.getTargetId(row['adGroup.id'], row['target.value'], row['target.matchType']);
            valuesToInsert.push({
                accountId: input.accountId,
                bucketStart,
                bucketDate,
                bucketHour,
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
    // Batch insert performance data with progress updates
    const BATCH_SIZE = 1000;
    let insertedCount = 0;
    let changedCount = 0;
    valuesToInsert.sort((left, right) =>
        [left.bucketStart.toISOString(), left.adId, left.entityType, left.entityId].join('|').localeCompare([right.bucketStart.toISOString(), right.adId, right.entityType, right.entityId].join('|'))
    );

    for (let i = 0; i < valuesToInsert.length; i += BATCH_SIZE) {
        const batch = valuesToInsert.slice(i, i + BATCH_SIZE);
        const changedRows = await withDatabaseRetry(() =>
            db
                .insert(performanceHourly)
                .values(batch)
                .onConflictDoUpdate({
                    target: [performanceHourly.accountId, performanceHourly.bucketStart, performanceHourly.adId, performanceHourly.entityType, performanceHourly.entityId],
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
                        ${performanceHourly.campaignId},
                        ${performanceHourly.adGroupId},
                        ${performanceHourly.impressions},
                        ${performanceHourly.clicks},
                        ${performanceHourly.spend},
                        ${performanceHourly.sales},
                        ${performanceHourly.purchases}
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
                .returning({ accountId: performanceHourly.accountId })
        );
        changedCount += changedRows.length;
        insertedCount += batch.length;
        await updateProgress(input.reportUid, rows.length, insertedCount + streamOwnedRows, errors.length);
    }

    // Final progress update (in case there were no values to insert)
    if (valuesToInsert.length === 0) {
        await updateProgress(input.reportUid, rows.length, streamOwnedRows, errors.length);
    }

    return {
        successCount: valuesToInsert.length + streamOwnedRows,
        changedCount,
        errorCount: errors.length,
        rowsProcessed: rows.length,
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
