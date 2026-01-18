/**
 * Job: Summarize daily target stream data from AMS into performanceDaily table for a specific account.
 * Aggregates delta data from amsSpConversion and amsSpTraffic for the current day
 * (in account timezone) into performanceDaily.
 */

import { formatInTimeZone } from 'date-fns-tz';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { advertiserAccount, amsSpConversion, amsSpTraffic, performanceDaily } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { zonedNow, zonedStartOfDay } from '@/utils/date';
import { getTimezoneForCountry } from '@/utils/timezones';
import { withJobMetrics, type JobMetricsRecorder } from '@/utils/job-metrics';

const jobInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string(),
});

export const summarizeDailyTargetStreamForAccountJob = boss
    .createJob('summarize-daily-target-stream-for-account')
    .input(jobInputSchema)
    .work(async jobs => {
        await Promise.all(
            jobs.map(job =>
                withJobMetrics(
                    {
                        jobName: 'summarize-daily-target-stream-for-account',
                        bossJobId: job.id,
                        input: job.data,
                        accountId: job.data.accountId,
                        countryCode: job.data.countryCode,
                    },
                    recorder => summarizeDailyForAccount(job.data.accountId, job.data.countryCode, recorder)
                )
            )
        );
    });

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

async function summarizeDailyForAccount(accountId: string, countryCode: string, recorder: JobMetricsRecorder) {
    const accountRecord = await db
        .select({ entityId: advertiserAccount.entityId })
        .from(advertiserAccount)
        .where(and(eq(advertiserAccount.adsAccountId, accountId), eq(advertiserAccount.countryCode, countryCode)))
        .limit(1);

    const entityId = accountRecord[0]?.entityId;
    const timezone = getTimezoneForCountry(countryCode);
    const now = zonedNow(timezone);
    const todayStart = zonedStartOfDay(now, timezone);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const bucketDateStr = formatInTimeZone(todayStart, timezone, 'yyyy-MM-dd');
    const datasetBadge = `daily target · ${formatInTimeZone(todayStart, timezone, 'MMM d')}`;

    if (!entityId) {
        recorder.addEvent({
            message: `Skipped {{badges}} summary (missing entity id).`,
            badges: [datasetBadge],
            payload: {
                cadence: 'daily',
                accountId,
                countryCode,
                bucketDate: bucketDateStr,
                reason: 'missing-entity-id',
            },
        });
        return;
    }

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

    const conversionMap = new Map<string, { sales: number; orders: number }>();
    for (const conv of conversionAggregates) {
        conversionMap.set(`${conv.campaignId}|${conv.adGroupId}|${conv.adId}|${conv.keywordId}`, { sales: conv.sales, orders: conv.orders });
    }

    const aggregatedData: AggregatedRow[] = trafficAggregates.map(traffic => {
        const key = `${traffic.campaignId}|${traffic.adGroupId}|${traffic.adId}|${traffic.keywordId}`;
        const conversion = conversionMap.get(key) ?? { sales: 0, orders: 0 };
        return {
            ...traffic,
            sales: conversion.sales,
            orders: conversion.orders,
        };
    });

    const trafficKeys = new Set(trafficAggregates.map(t => `${t.campaignId}|${t.adGroupId}|${t.adId}|${t.keywordId}`));
    for (const conv of conversionAggregates) {
        const key = `${conv.campaignId}|${conv.adGroupId}|${conv.adId}|${conv.keywordId}`;
        if (!trafficKeys.has(key)) {
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

    const insertValues = aggregatedData.map(row => ({
        accountId,
        bucketStart: todayStart,
        bucketDate: bucketDateStr,
        campaignId: row.campaignId,
        adGroupId: row.adGroupId,
        adId: row.adId,
        entityType: 'target' as const,
        entityId: row.keywordId,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: String(row.spend),
        sales: String(row.sales),
        orders: row.orders,
    }));

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
                    orders: sql`excluded.orders`,
                },
            });
    }

    recorder.addEvent({
        message: `Updated {{badges}} with latest stream data. ${insertValues.length} rows.`,
        badges: [datasetBadge],
        payload: {
            cadence: 'daily',
            accountId,
            countryCode,
            bucketDate: bucketDateStr,
            trafficAggregates: trafficAggregates.length,
            conversionAggregates: conversionAggregates.length,
            rowsInserted: insertValues.length,
        },
    });
}
