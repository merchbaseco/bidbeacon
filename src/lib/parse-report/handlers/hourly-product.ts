import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { reportConfigs } from '@/config/reports/configs';
import { db } from '@/db/index';
import { performanceHourly } from '@/db/schema';
import { createContextLogger } from '@/utils/logger';
import { getTimezoneForCountry } from '@/utils/timezones';
import type { ParseReportInput } from '../index';
import { parseHourlyTimestamp } from '../utils/parse-timestamps';
import type { ReportMetadata } from '../validate-report-ready';

const gunzipAsync = promisify(gunzip);

export async function handleHourlyProduct(input: ParseReportInput, metadata: ReportMetadata): Promise<{ rowsProcessed: number }> {
    const reportConfig = reportConfigs[input.aggregation][input.entityType];
    const timezone = getTimezoneForCountry(metadata.countryCode);

    const logger = createContextLogger({
        component: 'parse-report',
        handler: 'hourly-product',
        accountId: input.accountId,
        timestamp: input.timestamp,
    });

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

    let insertedCount = 0;
    for (const row of rows) {
        // For product reports, entityId is the advertised product ID
        const entityId = (row as { 'advertisedProduct.id': string | null })['advertisedProduct.id'];
        if (!entityId) {
            logger.warn({ row }, 'Skipping row with null advertisedProduct.id');
            continue;
        }

        const hourValue = (row as { 'hour.value': string })['hour.value'];
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
                targetMatchType: null,
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
                    targetMatchType: null,
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
