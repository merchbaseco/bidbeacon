/**
 * Job: Summarize daily target stream data from AMS into performanceDaily table for a specific account.
 * Aggregates delta data from amsSpConversion and amsSpTraffic for the current day
 * (in account timezone) into performanceDaily.
 */

import { formatInTimeZone } from 'date-fns-tz';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { amsSpConversion, amsSpTraffic, performanceDaily } from '@/db/schema.js';
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
        for (const job of jobs) {
            const { accountId, countryCode } = job.data;

            const timezone = getTimezoneForCountry(countryCode);
            const now = zonedNow(timezone);
            const todayStart = zonedStartOfDay(now, timezone);
            const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1); // End of day

            // Aggregate traffic data (impressions, clicks, spend, matchType), grouped by keywordId (aka targetId)
            const trafficAggregates = await db
                .select({
                    campaignId: amsSpTraffic.campaignId,
                    adGroupId: amsSpTraffic.adGroupId,
                    adId: amsSpTraffic.adId,
                    keywordId: amsSpTraffic.keywordId,
                    matchType: amsSpTraffic.matchType,
                    impressions: sql<number>`COALESCE(SUM(${amsSpTraffic.impressions}), 0)::int`,
                    clicks: sql<number>`COALESCE(SUM(${amsSpTraffic.clicks}), 0)::int`,
                    spend: sql<number>`COALESCE(SUM(${amsSpTraffic.cost}), 0)`,
                })
                .from(amsSpTraffic)
                .where(and(eq(amsSpTraffic.advertiserId, accountId), gte(amsSpTraffic.timeWindowStart, todayStart), lte(amsSpTraffic.timeWindowStart, todayEnd)))
                .groupBy(amsSpTraffic.campaignId, amsSpTraffic.adGroupId, amsSpTraffic.adId, amsSpTraffic.keywordId);

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
                .where(and(eq(amsSpConversion.advertiserId, accountId), gte(amsSpConversion.timeWindowStart, todayStart), lte(amsSpConversion.timeWindowStart, todayEnd)))
                .groupBy(amsSpConversion.campaignId, amsSpConversion.adGroupId, amsSpConversion.adId, amsSpConversion.keywordId);

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
                matchType: string | null;
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
                        matchType: null,
                        impressions: 0,
                        clicks: 0,
                        spend: 0,
                        sales: conv.sales,
                        orders: conv.orders,
                    });
                }
            }

            // Convert todayStart to bucketDate (account-local day label)
            // bucketDate is the date string in YYYY-MM-DD format for the account's timezone
            const bucketDateStr = formatInTimeZone(todayStart, timezone, 'yyyy-MM-dd');

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
                targetMatchType: row.matchType,
                impressions: row.impressions,
                clicks: row.clicks,
                spend: String(row.spend),
                sales: String(row.sales),
                orders: row.orders,
            }));

            // Batch insert/update performanceDaily rows in chunks of 1000
            const batchSize = 1000;
            for (let i = 0; i < insertValues.length; i += batchSize) {
                const batch = insertValues.slice(i, i + batchSize);
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
            }
        }
    });
