import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { hourlyReportRowSchema } from '@/config/reports/hourly-target';
import { db } from '@/db/index';
import { performanceHourly, reportDatasetErrorMetrics, reportDatasetMetadata } from '@/db/schema';
import { emitEvent } from '@/utils/events';
import { getTimezoneForCountry } from '@/utils/timezones';
import { TargetCache } from '../utils/target-cache';
import { normalizeHourlyValue, parseHourlyTimestamp } from '../utils/parse-period-start-timestamp';
import type { ParseReportInput, ParseReportOutput } from './input';

const gunzipAsync = promisify(gunzip);

export async function handleHourlyTarget(input: ParseReportInput): Promise<ParseReportOutput> {
    const startTime = performance.now();
    console.log(`[handleHourlyTarget] Starting for report ${input.reportUid}`);

    const timezone = getTimezoneForCountry(input.countryCode);

    const fetchStart = performance.now();
    const response = await fetch(input.reportUrl, {
        signal: AbortSignal.timeout(60000),
    });
    const fetchTime = performance.now() - fetchStart;
    console.log(`[handleHourlyTarget] Fetch report: ${fetchTime.toFixed(2)}ms`);

    if (!response.ok) {
        throw new Error(`Failed to download report: ${response.status} ${response.statusText}`);
    }

    const decompressStart = performance.now();
    const compressedData = await response.arrayBuffer();
    const decompressedData = await gunzipAsync(Buffer.from(compressedData));
    const decompressTime = performance.now() - decompressStart;
    console.log(`[handleHourlyTarget] Decompress: ${decompressTime.toFixed(2)}ms`);

    const parseStart = performance.now();
    const rawJson = JSON.parse(decompressedData.toString());
    const rows = z.array(hourlyReportRowSchema).parse(rawJson);
    const parseTime = performance.now() - parseStart;
    console.log(`[handleHourlyTarget] Parse JSON + validate: ${parseTime.toFixed(2)}ms (${rows.length} rows)`);

    // Pre-fetch all targets for batch lookup
    const cacheStart = performance.now();
    const uniqueAdGroupIds = [...new Set(rows.map(r => r['adGroup.id']))];
    const targetCache = await TargetCache.build(uniqueAdGroupIds);
    const cacheTime = performance.now() - cacheStart;
    console.log(`[handleHourlyTarget] Build target cache: ${cacheTime.toFixed(2)}ms (${uniqueAdGroupIds.length} unique ad groups)`);

    // Build insert values, tracking any target lookup errors
    const processStart = performance.now();
    const valuesToInsert: (typeof performanceHourly.$inferInsert)[] = [];
    const errors: { row: Record<string, unknown>; error: string }[] = [];

    for (const row of rows) {
        try {
            const entityId = targetCache.getTargetId(row['adGroup.id'], row['target.value'], row['target.matchType']);
            const normalizedHourValue = normalizeHourlyValue(row['hour.value'], row['date.value']);
            const { bucketStart, bucketDate, bucketHour } = parseHourlyTimestamp(normalizedHourValue, timezone);

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
                orders: row['metric.purchases'],
            });
        } catch (error) {
            errors.push({
                row: row as unknown as Record<string, unknown>,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    const processTime = performance.now() - processStart;
    console.log(`[handleHourlyTarget] Process rows: ${processTime.toFixed(2)}ms (${valuesToInsert.length} values, ${errors.length} errors)`);

    // Batch insert performance data with progress updates
    const BATCH_SIZE = 1000;
    let insertedCount = 0;
    const insertStart = performance.now();
    let totalInsertTime = 0;
    let totalProgressTime = 0;

    for (let i = 0; i < valuesToInsert.length; i += BATCH_SIZE) {
        const batch = valuesToInsert.slice(i, i + BATCH_SIZE);
        const batchInsertStart = performance.now();
        await db
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
                    orders: sql`excluded.orders`,
                },
            });
        const batchInsertTime = performance.now() - batchInsertStart;
        totalInsertTime += batchInsertTime;

        const progressStart = performance.now();
        insertedCount += batch.length;
        await updateProgress(input.reportUid, rows.length, insertedCount, errors.length);
        const progressTime = performance.now() - progressStart;
        totalProgressTime += progressTime;
    }
    const insertTime = performance.now() - insertStart;
    console.log(`[handleHourlyTarget] Batch inserts: ${insertTime.toFixed(2)}ms total (${totalInsertTime.toFixed(2)}ms DB, ${totalProgressTime.toFixed(2)}ms progress updates)`);

    // Batch insert error records
    if (errors.length > 0) {
        const errorInsertStart = performance.now();
        for (let i = 0; i < errors.length; i += BATCH_SIZE) {
            const batch = errors.slice(i, i + BATCH_SIZE);
            await db.insert(reportDatasetErrorMetrics).values(
                batch.map(e => ({
                    reportDatasetMetadataId: input.reportUid,
                    row: e.row,
                    error: e.error,
                }))
            );
        }
        const errorInsertTime = performance.now() - errorInsertStart;
        console.log(`[handleHourlyTarget] Error inserts: ${errorInsertTime.toFixed(2)}ms`);
    }

    // Final progress update (in case there were no values to insert)
    if (valuesToInsert.length === 0) {
        await updateProgress(input.reportUid, rows.length, 0, errors.length);
    }

    const totalTime = performance.now() - startTime;
    console.log(`[handleHourlyTarget] Total time: ${totalTime.toFixed(2)}ms`);

    return { successCount: valuesToInsert.length, errorCount: errors.length, rowsProcessed: valuesToInsert.length + errors.length };
}

async function updateProgress(reportUid: string, totalRecords: number, successRecords: number, errorRecords: number) {
    const [updatedRow] = await db.update(reportDatasetMetadata).set({ totalRecords, successRecords, errorRecords }).where(eq(reportDatasetMetadata.uid, reportUid)).returning();
    emitEvent({
        type: 'report:refreshed',
        row: updatedRow,
    });
}
