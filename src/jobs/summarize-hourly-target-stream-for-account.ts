/**
 * Job: Summarize hourly target stream data from AMS into performanceHourly table for a specific account.
 * Aggregates delta data from amsSpConversion and amsSpTraffic for the current day
 * (in account timezone) into performanceHourly, grouped by hour.
 */

import { formatInTimeZone } from 'date-fns-tz';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { advertiserAccount, amsSpConversion, amsSpTraffic, performanceHourly } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { zonedNow, zonedStartOfDay } from '@/utils/date';
import { getTimezoneForCountry } from '@/utils/timezones';

// ============================================================================
// Job Definition
// ============================================================================

const jobInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string(),
});

export const summarizeHourlyTargetStreamForAccountJob = boss
    .createJob('summarize-hourly-target-stream-for-account')
    .input(jobInputSchema)
    .work(async jobs => {
        const allMetadata: Array<{ accountId: string; bucketDate: string; trafficAggregates: number; conversionAggregates: number; rowsInserted: number }> = [];

        for (const job of jobs) {
            const startTime = performance.now();
            const { accountId, countryCode } = job.data;

            console.log(`[summarize-hourly-target-stream-for-account] Starting for account ${accountId} (${countryCode})`);

            // Look up entityId from advertiserAccount table
            // The accountId parameter is ads_account_id, but ams_sp_traffic stores entity_id as advertiser_id
            const accountRecord = await db
                .select({ entityId: advertiserAccount.entityId })
                .from(advertiserAccount)
                .where(and(eq(advertiserAccount.adsAccountId, accountId), eq(advertiserAccount.countryCode, countryCode)))
                .limit(1);

            if (!accountRecord[0]?.entityId) {
                console.warn(`[summarize-hourly-target-stream-for-account] Account ${accountId} (${countryCode}): No entityId found, skipping`);
                continue;
            }

            const entityId = accountRecord[0].entityId;
            console.log(`[summarize-hourly-target-stream-for-account] Account ${accountId} (${countryCode}): Using entityId ${entityId}`);

            const timezone = getTimezoneForCountry(countryCode);
            const now = zonedNow(timezone);
            const todayStart = zonedStartOfDay(now, timezone);
            const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1); // End of day

            const bucketDateStr = formatInTimeZone(todayStart, timezone, 'yyyy-MM-dd');
            console.log(`[summarize-hourly-target-stream-for-account] Account ${accountId}: Querying data for bucketDate ${bucketDateStr} (${todayStart.toISOString()} to ${todayEnd.toISOString()})`);

            // Aggregate traffic data by hour (impressions, clicks, spend), grouped by keywordId and hour
            const trafficAggregates = await db
                .select({
                    campaignId: amsSpTraffic.campaignId,
                    adGroupId: amsSpTraffic.adGroupId,
                    adId: amsSpTraffic.adId,
                    keywordId: amsSpTraffic.keywordId,
                    hourStart: sql<Date>`date_trunc('hour', ${amsSpTraffic.timeWindowStart})`.as('hour_start'),
                    impressions: sql<number>`COALESCE(SUM(${amsSpTraffic.impressions}), 0)::int`,
                    clicks: sql<number>`COALESCE(SUM(${amsSpTraffic.clicks}), 0)::int`,
                    spend: sql<number>`COALESCE(SUM(${amsSpTraffic.cost}), 0)`,
                })
                .from(amsSpTraffic)
                .where(and(eq(amsSpTraffic.advertiserId, entityId), gte(amsSpTraffic.timeWindowStart, todayStart), lte(amsSpTraffic.timeWindowStart, todayEnd)))
                .groupBy(amsSpTraffic.campaignId, amsSpTraffic.adGroupId, amsSpTraffic.adId, amsSpTraffic.keywordId, sql`date_trunc('hour', ${amsSpTraffic.timeWindowStart})`);

            console.log(`[summarize-hourly-target-stream-for-account] Account ${accountId}: Found ${trafficAggregates.length} hourly traffic aggregates`);

            // Aggregate conversion data by hour (sales, orders), grouped by keywordId and hour
            const conversionAggregates = await db
                .select({
                    campaignId: amsSpConversion.campaignId,
                    adGroupId: amsSpConversion.adGroupId,
                    adId: amsSpConversion.adId,
                    keywordId: amsSpConversion.keywordId,
                    hourStart: sql<Date>`date_trunc('hour', ${amsSpConversion.timeWindowStart})`.as('hour_start'),
                    sales: sql<number>`COALESCE(SUM(${amsSpConversion.attributedSales14d}), 0)`,
                    orders: sql<number>`COALESCE(SUM(${amsSpConversion.attributedConversions14d}), 0)::int`,
                })
                .from(amsSpConversion)
                .where(and(eq(amsSpConversion.advertiserId, entityId), gte(amsSpConversion.timeWindowStart, todayStart), lte(amsSpConversion.timeWindowStart, todayEnd)))
                .groupBy(amsSpConversion.campaignId, amsSpConversion.adGroupId, amsSpConversion.adId, amsSpConversion.keywordId, sql`date_trunc('hour', ${amsSpConversion.timeWindowStart})`);

            console.log(`[summarize-hourly-target-stream-for-account] Account ${accountId}: Found ${conversionAggregates.length} hourly conversion aggregates`);

            // Create a map of conversion aggregates for quick lookup using keywordId + hourStart as composite key
            const conversionMap = new Map<string, { sales: number; orders: number }>();
            for (const conv of conversionAggregates) {
                const key = `${conv.keywordId}|${new Date(conv.hourStart).toISOString()}`;
                conversionMap.set(key, { sales: conv.sales, orders: conv.orders });
            }

            // Combine traffic and conversion aggregates
            type AggregatedRow = {
                campaignId: string;
                adGroupId: string;
                adId: string;
                keywordId: string;
                hourStart: Date;
                impressions: number;
                clicks: number;
                spend: number;
                sales: number;
                orders: number;
            };

            const aggregatedData: AggregatedRow[] = trafficAggregates.map(traffic => {
                const key = `${traffic.keywordId}|${new Date(traffic.hourStart).toISOString()}`;
                const conversion = conversionMap.get(key) ?? { sales: 0, orders: 0 };
                return {
                    ...traffic,
                    hourStart: new Date(traffic.hourStart),
                    sales: conversion.sales,
                    orders: conversion.orders,
                };
            });

            // Also add conversion-only rows (no traffic data). This is probably unlikely, but if the conversion
            // data comes in async from the traffic data, it's probably possible.
            const trafficKeys = new Set(trafficAggregates.map(t => `${t.keywordId}|${new Date(t.hourStart).toISOString()}`));
            for (const conv of conversionAggregates) {
                const key = `${conv.keywordId}|${new Date(conv.hourStart).toISOString()}`;
                if (!trafficKeys.has(key)) {
                    aggregatedData.push({
                        campaignId: conv.campaignId,
                        adGroupId: conv.adGroupId,
                        adId: conv.adId,
                        keywordId: conv.keywordId,
                        hourStart: new Date(conv.hourStart),
                        impressions: 0,
                        clicks: 0,
                        spend: 0,
                        sales: conv.sales,
                        orders: conv.orders,
                    });
                }
            }

            console.log(`[summarize-hourly-target-stream-for-account] Account ${accountId}: Combined into ${aggregatedData.length} hourly aggregated rows`);

            // Prepare batch insert values
            const insertValues = aggregatedData.map(row => {
                // Extract hour from hourStart in the account's timezone
                const hourInTimezone = parseInt(formatInTimeZone(row.hourStart, timezone, 'H'), 10);

                return {
                    accountId,
                    bucketStart: row.hourStart,
                    bucketDate: bucketDateStr,
                    bucketHour: hourInTimezone,
                    campaignId: row.campaignId,
                    adGroupId: row.adGroupId,
                    adId: row.adId,
                    entityType: 'target' as const,
                    entityId: row.keywordId, // keywordId is the same as targetId
                    impressions: row.impressions,
                    clicks: row.clicks,
                    spend: String(row.spend),
                    sales: String(row.sales),
                    orders: row.orders,
                };
            });

            console.log(`[summarize-hourly-target-stream-for-account] Account ${accountId}: Prepared ${insertValues.length} rows to insert for bucketDate ${bucketDateStr}`);

            // Batch insert/update performanceHourly rows in chunks of 1000
            const batchSize = 1000;
            let insertedBatches = 0;
            for (let i = 0; i < insertValues.length; i += batchSize) {
                const batch = insertValues.slice(i, i + batchSize);
                const batchStart = performance.now();
                try {
                    await db
                        .insert(performanceHourly)
                        .values(batch)
                        .onConflictDoUpdate({
                            target: [performanceHourly.accountId, performanceHourly.bucketStart, performanceHourly.adId, performanceHourly.entityType, performanceHourly.entityId],
                            set: {
                                bucketDate: sql`excluded.bucket_date`,
                                bucketHour: sql`excluded.bucket_hour`,
                                campaignId: sql`excluded.campaign_id`,
                                adGroupId: sql`excluded.ad_group_id`,
                                targetMatchType: sql`excluded.target_match_type`,
                                impressions: sql`excluded.impressions`,
                                clicks: sql`excluded.clicks`,
                                spend: sql`excluded.spend`,
                                sales: sql`excluded.sales`,
                                orders: sql`excluded.orders`,
                            },
                        });
                    const batchTime = performance.now() - batchStart;
                    insertedBatches++;
                    console.log(`[summarize-hourly-target-stream-for-account] Account ${accountId}: Batch ${insertedBatches} (${batch.length} rows) inserted in ${batchTime.toFixed(2)}ms`);
                } catch (error) {
                    const batchTime = performance.now() - batchStart;
                    console.error(
                        `[summarize-hourly-target-stream-for-account] Account ${accountId}: Batch ${insertedBatches + 1} (${batch.length} rows) FAILED after ${batchTime.toFixed(2)}ms:`,
                        error
                    );
                    throw error;
                }
            }

            const totalTime = performance.now() - startTime;
            console.log(`[summarize-hourly-target-stream-for-account] Account ${accountId}: Completed in ${totalTime.toFixed(2)}ms (${insertedBatches} batches, ${insertValues.length} total rows)`);

            // Collect metadata for this job
            allMetadata.push({
                accountId,
                bucketDate: bucketDateStr,
                trafficAggregates: trafficAggregates.length,
                conversionAggregates: conversionAggregates.length,
                rowsInserted: insertValues.length,
            });
        }

        // Return aggregated metadata
        const totalRowsInserted = allMetadata.reduce((sum, m) => sum + m.rowsInserted, 0);
        return {
            metadata: {
                accountsProcessed: allMetadata.length,
                totalRowsInserted,
                accounts: allMetadata,
            },
        };
    });

