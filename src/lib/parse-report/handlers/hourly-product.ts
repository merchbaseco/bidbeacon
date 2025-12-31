import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { z } from 'zod';
import { hourlyReportRowSchema } from '@/config/reports/hourly-product';
import { db } from '@/db/index';
import { performanceHourly } from '@/db/schema';
import { getTimezoneForCountry } from '@/utils/timezones';
import { normalizeHourlyValue, parseHourlyTimestamp } from '../utils/parse-period-start-timestamp';
import type { ParseReportInput } from './input';

const gunzipAsync = promisify(gunzip);

export async function handleHourlyProduct(input: ParseReportInput): Promise<{ rowsProcessed: number }> {
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

    const rows = z.array(hourlyReportRowSchema).parse(rawJson);

    let insertedCount = 0;
    for (const row of rows) {
        // For product reports, entityId is the advertised product ID
        const entityId = row['advertisedProduct.id'];
        const normalizedHourValue = normalizeHourlyValue(row['hour.value'], row['date.value']);
        const { bucketStart, bucketDate, bucketHour } = parseHourlyTimestamp(normalizedHourValue, timezone);

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
                entityType: input.reportConfig.entityType,
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
