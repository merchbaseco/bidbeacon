import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { dailyReportRowSchema } from '@/config/reports/daily-target';
import { db } from '@/db/index';
import { performanceDaily, reportDatasetErrorMetrics, reportDatasetMetadata } from '@/db/schema';
import { emitEvent } from '@/utils/events';
import { getTimezoneForCountry } from '@/utils/timezones';
import { getNormalizedTarget } from '../utils/lookup-target-id';
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

    let successCount = 0;
    let errorCount = 0;
    for (const row of rows) {
        try {
            const { entityId, matchType } = await getNormalizedTarget(row['adGroup.id'], row['target.value'], row['target.matchType']);

            const dateValue = row['date.value'];
            const { bucketStart, bucketDate } = parseDailyTimestamp(dateValue, timezone);

            await db
                .insert(performanceDaily)
                .values({
                    accountId: input.accountId,
                    bucketStart,
                    bucketDate,
                    campaignId: row['campaign.id'],
                    adGroupId: row['adGroup.id'],
                    adId: row['ad.id'],
                    entityType: input.reportConfig.entityType,
                    entityId,
                    targetMatchType: matchType,
                    impressions: row['metric.impressions'],
                    clicks: row['metric.clicks'],
                    spend: String(row['metric.totalCost']),
                    sales: String(row['metric.sales']),
                    orders: row['metric.purchases'],
                })
                .onConflictDoUpdate({
                    target: [performanceDaily.accountId, performanceDaily.bucketDate, performanceDaily.adId, performanceDaily.entityType, performanceDaily.entityId],
                    set: {
                        campaignId: row['campaign.id'],
                        adGroupId: row['adGroup.id'],
                        targetMatchType: matchType,
                        impressions: row['metric.impressions'],
                        clicks: row['metric.clicks'],
                        spend: String(row['metric.totalCost']),
                        sales: String(row['metric.sales']),
                        orders: row['metric.purchases'],
                    },
                });

            successCount++;
        } catch (error) {
            // Store the error and full row in reportDatasetErrorMetrics
            await db.insert(reportDatasetErrorMetrics).values({
                reportDatasetMetadataId: input.reportUid,
                row: row as unknown as Record<string, unknown>,
                error: error instanceof Error ? error.message : String(error),
            });
            errorCount++;
        }

        // Every 50 records, update the reportDatasetMetadata with the success and error counts.
        // Also on the first and last iterations!
        const totalCount = successCount + errorCount;
        if (totalCount % 50 === 0 || totalCount === rows.length || totalCount === 1) {
            const [updatedRow] = await db
                .update(reportDatasetMetadata)
                .set({
                    totalRecords: rows.length,
                    successRecords: successCount,
                    errorRecords: errorCount,
                })
                .where(eq(reportDatasetMetadata.uid, input.reportUid))
                .returning();
            emitEvent({
                type: 'report:refreshed',
                row: updatedRow,
            });
        }
    }

    return { successCount: successCount, errorCount: errorCount };
}
