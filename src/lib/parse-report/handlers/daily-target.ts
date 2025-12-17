import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { reportConfigs } from '@/config/reports/configs';
import { db } from '@/db/index';
import { performanceDaily } from '@/db/schema';
import { getTimezoneForCountry } from '@/utils/timezones';
import type { ParseReportInput } from '../index';
import { lookupTargetId } from '../utils/lookup-target-id';
import { parseDailyTimestamp } from '../utils/parse-timestamps';
import type { ReportMetadata } from '../validate-report-ready';

const gunzipAsync = promisify(gunzip);

export async function handleDailyTarget(input: ParseReportInput, metadata: ReportMetadata): Promise<{ rowsProcessed: number }> {
    const reportConfig = reportConfigs[input.aggregation][input.entityType];
    const timezone = getTimezoneForCountry(input.countryCode);

    console.log(`[API] Downloading report from URL...`);

    const response = await fetch(metadata.reportUrl, {
        signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
        throw new Error(`Failed to download report: ${response.status} ${response.statusText}`);
    }

    const compressedData = await response.arrayBuffer();
    const decompressedData = await gunzipAsync(Buffer.from(compressedData));
    const rawJson = JSON.parse(decompressedData.toString());

    const { z } = await import('zod');
    const rows = z.array(reportConfig.rowSchema).parse(rawJson);

    console.log(`[API] Parsed ${rows.length} rows from report`);

    let insertedCount = 0;
    for (const row of rows) {
        const { entityId, matchType } = await lookupTargetId(row);

        const dateValue = (row as { 'date.value': string })['date.value'];
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
                entityType: reportConfig.entityType,
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

        insertedCount++;
    }

    return { rowsProcessed: insertedCount };
}
