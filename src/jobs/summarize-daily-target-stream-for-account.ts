/**
 * Job: Summarize daily target stream data from AMS into performanceDaily table for a specific account.
 * Aggregates delta data from amsSpConversion and amsSpTraffic for the current day
 * (in account timezone) into performanceDaily.
 */

import { formatInTimeZone } from 'date-fns-tz';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { advertiserAccount, amsSpConversion, amsSpTraffic, performanceDaily } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';
import { zonedNow, zonedStartOfDay } from '@/utils/date.js';
import { getTimezoneForCountry } from '@/utils/timezones.js';

// ============================================================================
// Job Definition
// ============================================================================

const jobInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string(),
});

export const summarizeDailyTargetStreamForAccountJob = boss
    .createJob('summarize-daily-target-stream-for-account')
    .input(jobInputSchema)
    .work(async jobs => {
        const allMetadata: Array<{ accountId: string; bucketDate: string; trafficAggregates: number; conversionAggregates: number; rowsInserted: number }> = [];

        for (const job of jobs) {
            const startTime = performance.now();
            const { accountId, countryCode } = job.data;

            console.log(`[summarize-daily-target-stream-for-account] Starting for account ${accountId} (${countryCode})`);

            // Look up entityId from advertiserAccount table
            // The accountId parameter is ads_account_id, but ams_sp_traffic stores entity_id as advertiser_id
            const accountRecord = await db
                .select({ entityId: advertiserAccount.entityId })
                .from(advertiserAccount)
                .where(and(eq(advertiserAccount.adsAccountId, accountId), eq(advertiserAccount.countryCode, countryCode)))
                .limit(1);

            if (!accountRecord[0]?.entityId) {
                console.warn(`[summarize-daily-target-stream-for-account] Account ${accountId} (${countryCode}): No entityId found, skipping`);
                continue;
            }

            const entityId = accountRecord[0].entityId;
            console.log(`[summarize-daily-target-stream-for-account] Account ${accountId} (${countryCode}): Using entityId ${entityId}`);

            const timezone = getTimezoneForCountry(countryCode);
            const now = zonedNow(timezone);
            const todayStart = zonedStartOfDay(now, timezone);
            const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1); // End of day

            const bucketDateStr = formatInTimeZone(todayStart, timezone, 'yyyy-MM-dd');
            console.log(`[summarize-daily-target-stream-for-account] Account ${accountId}: Querying data for bucketDate ${bucketDateStr} (${todayStart.toISOString()} to ${todayEnd.toISOString()})`);

            // Aggregate traffic data (impressions, clicks, spend, matchType), grouped by keywordId (aka targetId)
            const trafficAggregates = await db
                .select({
                    campaignId: amsSpTraffic.campaignId,
                    adGroupId: amsSpTraffic.adGroupId,
                    adId: amsSpTraffic.adId,
                    keywordId: amsSpTraffic.keywordId,
                    impressions: sql<number>`COALESCE(SUM(${amsSpTraffic.impressions}), 0)::int`,
                    clicks: sql<number>`COALESCE(SUM(${amsSpTraffic.clicks}), 0)::int`,
                    spend: sql<number>`COALESCE(SUM(${amsSpTraffic.cost}), 0)`,
                })
                .from(amsSpTraffic)
                .where(and(eq(amsSpTraffic.advertiserId, entityId), gte(amsSpTraffic.timeWindowStart, todayStart), lte(amsSpTraffic.timeWindowStart, todayEnd)))
                .groupBy(amsSpTraffic.campaignId, amsSpTraffic.adGroupId, amsSpTraffic.adId, amsSpTraffic.keywordId);

            console.log(`[summarize-daily-target-stream-for-account] Account ${accountId}: Found ${trafficAggregates.length} traffic aggregates`);

            // Aggregate conversion data (sales, orders) separately, grouped by keywordId (aka targetId)
            const conversionAggregates = await db
                .select({
                    campaignId: amsSpConversion.campaignId,
                    adGroupId: amsSpConversion.adGroupId,
                    adId: amsSpConversion.adId,
                    keywordId: amsSpConversion.keywordId,
                    sales: sql<number>`COALESCE(SUM(${amsSpConversion.attributedSales14d}), 0)`,
                    orders: sql<number>`COALESCE(SUM(${amsSpConversion.attributedConversions14d}), 0)::int`,
                })
                .from(amsSpConversion)
                .where(and(eq(amsSpConversion.advertiserId, entityId), gte(amsSpConversion.timeWindowStart, todayStart), lte(amsSpConversion.timeWindowStart, todayEnd)))
                .groupBy(amsSpConversion.campaignId, amsSpConversion.adGroupId, amsSpConversion.adId, amsSpConversion.keywordId);

            console.log(`[summarize-daily-target-stream-for-account] Account ${accountId}: Found ${conversionAggregates.length} conversion aggregates`);

            // Create a map of conversion aggregates for quick lookup using keywordId as the unique key
            const conversionMap = new Map<string, { sales: number; orders: number }>();
            for (const conv of conversionAggregates) {
                conversionMap.set(conv.keywordId, { sales: conv.sales, orders: conv.orders });
            }

            // Combine traffic and conversion aggregates
            type AggregatedRow = {
                campaignId: string;
                adGroupId: string;
                adId: string;
                keywordId: string;
                impressions: number;
                clicks: number;
                spend: number;
                sales: number;
                orders: number;
            };

            const aggregatedData: AggregatedRow[] = trafficAggregates.map(traffic => {
                const key = traffic.keywordId;
                const conversion = conversionMap.get(key) ?? { sales: 0, orders: 0 };
                return {
                    ...traffic,
                    sales: conversion.sales,
                    orders: conversion.orders,
                };
            });

            // Also add conversion-only rows (no traffic data). This is probably unlikely, but if the conversion
            // data comes in async from the traffic data, it's probably possible.
            const trafficKeys = new Set(trafficAggregates.map(t => t.keywordId));
            for (const conv of conversionAggregates) {
                if (!trafficKeys.has(conv.keywordId)) {
                    aggregatedData.push({
                        campaignId: conv.campaignId,
                        adGroupId: conv.adGroupId,
                        adId: conv.adId,
                        keywordId: conv.keywordId,
                        impressions: 0,
                        clicks: 0,
                        spend: 0,
                        sales: conv.sales,
                        orders: conv.orders,
                    });
                }
            }

            console.log(`[summarize-daily-target-stream-for-account] Account ${accountId}: Combined into ${aggregatedData.length} aggregated rows`);

            // Convert todayStart to bucketDate (account-local day label)
            // bucketDate is the date string in YYYY-MM-DD format for the account's timezone

            // Prepare batch insert values
            const insertValues = aggregatedData.map(row => ({
                accountId,
                bucketStart: todayStart,
                bucketDate: bucketDateStr,
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
            }));

            console.log(`[summarize-daily-target-stream-for-account] Account ${accountId}: Prepared ${insertValues.length} rows to insert for bucketDate ${bucketDateStr}`);

            // Batch insert/update performanceDaily rows in chunks of 1000
            const batchSize = 1000;
            let insertedBatches = 0;
            for (let i = 0; i < insertValues.length; i += batchSize) {
                const batch = insertValues.slice(i, i + batchSize);
                const batchStart = performance.now();
                try {
                    await db
                        .insert(performanceDaily)
                        .values(batch)
                        .onConflictDoUpdate({
                            target: [performanceDaily.accountId, performanceDaily.bucketDate, performanceDaily.adId, performanceDaily.entityType, performanceDaily.entityId],
                            set: {
                                campaignId: sql`excluded.campaign_id`,
                                adGroupId: sql`excluded.ad_group_id`,
                                targetMatchType: sql`excluded.target_match_type`,
                                impressions: sql`excluded.impressions`,
                                clicks: sql`excluded.clicks`,
                                spend: sql`excluded.spend`,
                                sales: sql`excluded.sales`,
                                orders: sql`excluded.orders_14d`,
                            },
                        });
                    const batchTime = performance.now() - batchStart;
                    insertedBatches++;
                    console.log(`[summarize-daily-target-stream-for-account] Account ${accountId}: Batch ${insertedBatches} (${batch.length} rows) inserted in ${batchTime.toFixed(2)}ms`);
                } catch (error) {
                    const batchTime = performance.now() - batchStart;
                    console.error(`[summarize-daily-target-stream-for-account] Account ${accountId}: Batch ${insertedBatches + 1} (${batch.length} rows) FAILED after ${batchTime.toFixed(2)}ms:`, error);
                    throw error;
                }
            }

            const totalTime = performance.now() - startTime;
            console.log(`[summarize-daily-target-stream-for-account] Account ${accountId}: Completed in ${totalTime.toFixed(2)}ms (${insertedBatches} batches, ${insertValues.length} total rows)`);

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
