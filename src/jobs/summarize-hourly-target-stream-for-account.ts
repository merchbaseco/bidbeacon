/**
 * Job: Summarize hourly target stream data from AMS into performanceHourly table for a specific account.
 * Aggregates delta data from amsSpConversion and amsSpTraffic for the trailing 24 hours
 * into performanceHourly, grouped by hour.
 */

import { formatInTimeZone } from 'date-fns-tz';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { advertiserAccount, amsSpConversion, amsSpTraffic, performanceHourly } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { getTimezoneForCountry } from '@/utils/timezones';
import { withJobSession, type JobSessionRecorder } from '@/utils/job-sessions';

const jobInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string(),
});

export const summarizeHourlyTargetStreamForAccountJob = boss
    .createJob('summarize-hourly-target-stream-for-account')
    .input(jobInputSchema)
    .work(async jobs => {
        await Promise.all(
            jobs.map(job =>
                withJobSession(
                    {
                        jobName: 'summarize-hourly-target-stream-for-account',
                        bossJobId: job.id,
                        input: job.data,
                    },
                    recorder => summarizeHourlyForAccount(job.data.accountId, job.data.countryCode, recorder)
                )
            )
        );
    });

type HourlyRow = {
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

async function summarizeHourlyForAccount(accountId: string, countryCode: string, recorder: JobSessionRecorder) {
    const accountRecord = await db
        .select({ entityId: advertiserAccount.entityId })
        .from(advertiserAccount)
        .where(and(eq(advertiserAccount.adsAccountId, accountId), eq(advertiserAccount.countryCode, countryCode)))
        .limit(1);

    const entityId = accountRecord[0]?.entityId;
    if (!entityId) {
        await recorder.addAction({
            type: 'ams-summary-skipped',
            cadence: 'hourly',
            accountId,
            countryCode,
            reason: 'missing-entity-id',
        });
        return;
    }

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);
    const timezone = getTimezoneForCountry(countryCode);

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
        .where(and(eq(amsSpTraffic.advertiserId, entityId), gte(amsSpTraffic.timeWindowStart, windowStart), lte(amsSpTraffic.timeWindowStart, windowEnd)))
        .groupBy(amsSpTraffic.campaignId, amsSpTraffic.adGroupId, amsSpTraffic.adId, amsSpTraffic.keywordId, sql`date_trunc('hour', ${amsSpTraffic.timeWindowStart})`);

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
        .where(and(eq(amsSpConversion.advertiserId, entityId), gte(amsSpConversion.timeWindowStart, windowStart), lte(amsSpConversion.timeWindowStart, windowEnd)))
        .groupBy(amsSpConversion.campaignId, amsSpConversion.adGroupId, amsSpConversion.adId, amsSpConversion.keywordId, sql`date_trunc('hour', ${amsSpConversion.timeWindowStart})`);

    const conversionMap = new Map<string, { sales: number; orders: number }>();
    for (const conv of conversionAggregates) {
        conversionMap.set(`${conv.campaignId}|${conv.adGroupId}|${conv.adId}|${conv.keywordId}|${new Date(conv.hourStart).toISOString()}`, { sales: conv.sales, orders: conv.orders });
    }

    const aggregatedData: HourlyRow[] = trafficAggregates.map(traffic => {
        const key = `${traffic.campaignId}|${traffic.adGroupId}|${traffic.adId}|${traffic.keywordId}|${new Date(traffic.hourStart).toISOString()}`;
        const conversion = conversionMap.get(key) ?? { sales: 0, orders: 0 };
        return {
            ...traffic,
            hourStart: new Date(traffic.hourStart),
            sales: conversion.sales,
            orders: conversion.orders,
        };
    });

    const trafficKeys = new Set(trafficAggregates.map(t => `${t.campaignId}|${t.adGroupId}|${t.adId}|${t.keywordId}|${new Date(t.hourStart).toISOString()}`));
    for (const conv of conversionAggregates) {
        const key = `${conv.campaignId}|${conv.adGroupId}|${conv.adId}|${conv.keywordId}|${new Date(conv.hourStart).toISOString()}`;
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

    const insertValues = aggregatedData.map(row => {
        const rowBucketDate = formatInTimeZone(row.hourStart, timezone, 'yyyy-MM-dd');
        const hour = parseInt(formatInTimeZone(row.hourStart, timezone, 'H'), 10);
        return {
            accountId,
            bucketStart: row.hourStart,
            bucketDate: rowBucketDate,
            bucketHour: hour,
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
        };
    });

    const batchSize = 1000;
    for (let i = 0; i < insertValues.length; i += batchSize) {
        const batch = insertValues.slice(i, i + batchSize);
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
    }

    await recorder.addAction({
        type: 'ams-summary-complete',
        cadence: 'hourly',
        accountId,
        countryCode,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        trafficAggregates: trafficAggregates.length,
        conversionAggregates: conversionAggregates.length,
        rowsInserted: insertValues.length,
    });
}
