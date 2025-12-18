import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { z } from 'zod';
import { reportConfigs } from '@/config/reports/configs';
import { hourlyReportRowSchema } from '@/config/reports/hourly-target';
import { db } from '@/db/index';
import { performanceHourly } from '@/db/schema';
import { getTimezoneForCountry } from '@/utils/timezones';
import type { ParseReportInput } from '../index';
import { lookupTargetId } from '../utils/lookup-target-id';
import { parseHourlyTimestamp } from '../utils/parse-timestamps';
import type { ReportMetadata } from '../validate-report-ready';

const gunzipAsync = promisify(gunzip);

export async function handleHourlyTarget(input: ParseReportInput, metadata: ReportMetadata): Promise<{ rowsProcessed: number }> {
    const reportConfig = reportConfigs[input.aggregation][input.entityType];
    const timezone = getTimezoneForCountry(metadata.countryCode);

    const response = await fetch(metadata.reportUrl, {
        signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
        throw new Error(`Failed to download report: ${response.status} ${response.statusText}`);
    }

    const compressedData = await response.arrayBuffer();
    const decompressedData = await gunzipAsync(Buffer.from(compressedData));
    const rawJson = JSON.parse(decompressedData.toString());

    const rows = z.array(hourlyReportRowSchema).parse(rawJson);

    let insertedCount = 0;
    for (const row of rows) {
        const { entityId, matchType } = await lookupTargetId(row);

        const hourValue = row['hour.value'];
        const { bucketStart, bucketDate, bucketHour } = parseHourlyTimestamp(hourValue, timezone);

        await db
            .insert(performanceHourly)
            .values({
                accountId: input.accountId,
                bucketStart,
                bucketDate,
                bucketHour,
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
                target: [performanceHourly.accountId, performanceHourly.bucketStart, performanceHourly.adId, performanceHourly.entityType, performanceHourly.entityId],
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
