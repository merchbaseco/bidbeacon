import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { hourlyReportRowSchema } from '@/config/reports/hourly-target';
import { db } from '@/db/index';
import { performanceHourly } from '@/db/schema';
import { getTimezoneForCountry } from '@/utils/timezones';
import { TargetCache } from '../utils/target-cache';
import { parseHourlyTimestamp } from '../utils/parse-period-start-timestamp';
import type { ParseReportInput } from './input';

const gunzipAsync = promisify(gunzip);

export async function handleHourlyTarget(input: ParseReportInput): Promise<{ rowsProcessed: number }> {
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

    // Pre-fetch all targets for batch lookup
    const uniqueAdGroupIds = [...new Set(rows.map(r => r['adGroup.id']))];
    const targetCache = await TargetCache.build(uniqueAdGroupIds);

    // Build insert values
    const valuesToInsert: (typeof performanceHourly.$inferInsert)[] = [];
    for (const row of rows) {
        const entityId = targetCache.getTargetId(row['adGroup.id'], row['target.value'], row['target.matchType']);
        const { bucketStart, bucketDate, bucketHour } = parseHourlyTimestamp(row['hour.value'], timezone);

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
    }

    // Batch insert performance data
    const BATCH_SIZE = 1000;
    for (let i = 0; i < valuesToInsert.length; i += BATCH_SIZE) {
        const batch = valuesToInsert.slice(i, i + BATCH_SIZE);
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
    }

    return { rowsProcessed: valuesToInsert.length };
}
