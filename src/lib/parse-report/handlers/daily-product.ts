import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { z } from 'zod';
import { dailyReportRowSchema } from '@/config/reports/daily-product';
import { db } from '@/db/index';
import { performanceDaily } from '@/db/schema';
import { getTimezoneForCountry } from '@/utils/timezones';
import { parseDailyTimestamp } from '../utils/parse-period-start-timestamp';
import type { ParseReportInput } from './input';

const gunzipAsync = promisify(gunzip);

export async function handleDailyProduct(input: ParseReportInput): Promise<{ rowsProcessed: number }> {
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

    let insertedCount = 0;
    for (const row of rows) {
        // For product reports, entityId is the advertised product ID
        const entityId = row['advertisedProduct.id'];
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
                targetMatchType: null,
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
