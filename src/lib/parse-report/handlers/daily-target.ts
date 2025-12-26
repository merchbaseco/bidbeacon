import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { dailyReportRowSchema } from '@/config/reports/daily-target';
import { db } from '@/db/index';
import { performanceDaily, reportDatasetErrorMetrics, reportDatasetMetadata } from '@/db/schema';
import { emitEvent } from '@/utils/events';
import { getTimezoneForCountry } from '@/utils/timezones';
import { TargetCache } from '../utils/target-cache';
import { parseDailyTimestamp } from '../utils/parse-period-start-timestamp';
import type { ParseReportInput, ParseReportOutput } from './input';

const gunzipAsync = promisify(gunzip);

export async function handleDailyTarget(input: ParseReportInput): Promise<ParseReportOutput> {
    const timezone = getTimezoneForCountry(input.countryCode);

    const response = await fetch(input.reportUrl, {
        signal: AbortSignal.timeout(60000),
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
    const errors: { row: Record<string, unknown>; error: string }[] = [];

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
                orders: row['metric.purchases'],
            });
        } catch (error) {
            errors.push({
                row: row as unknown as Record<string, unknown>,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const BATCH_SIZE = 1000;
    let insertedCount = 0;

    // Set total upfront so progress bar starts at 0%
    await updateProgress(input.reportUid, valuesToInsert.length, 0, errors.length);

    for (let i = 0; i < valuesToInsert.length; i += BATCH_SIZE) {
        const batch = valuesToInsert.slice(i, i + BATCH_SIZE);
        await db
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
                    orders: sql`excluded.orders`,
                },
            });

        insertedCount += batch.length;
        await updateProgress(input.reportUid, valuesToInsert.length, insertedCount, errors.length);
    }

    if (errors.length > 0) {
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
    }

    return { successCount: valuesToInsert.length, errorCount: errors.length };
}

async function updateProgress(reportUid: string, totalRecords: number, successRecords: number, errorRecords: number) {
    const [updatedRow] = await db.update(reportDatasetMetadata).set({ totalRecords, successRecords, errorRecords }).where(eq(reportDatasetMetadata.uid, reportUid)).returning();
    emitEvent({
        type: 'report:refreshed',
        row: updatedRow,
    });
}
