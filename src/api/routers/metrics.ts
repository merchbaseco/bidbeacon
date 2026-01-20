import { addDays, addHours, addMonths, endOfDay, startOfDay, startOfMonth, subDays, subMonths, format } from 'date-fns';
import { and, desc, eq, gte, lt, lte, sql, isNotNull } from 'drizzle-orm';
import { fromZonedTime } from 'date-fns-tz';
import { z } from 'zod';
import { db } from '@/db/index';
import { amsMetrics, apiMetrics, events, jobMetrics, performanceDaily, performanceHourly } from '@/db/schema';
import { getPerformanceRange } from '@/lib/performance-range';
import { getTimezoneForCountry } from '@/utils/timezones';
import { protectedProcedure, router } from '../trpc';

const SUPPORTED_APIS = ['listAdvertiserAccounts', 'createReport', 'retrieveReport', 'exportCampaigns', 'exportAdGroups', 'exportAds', 'exportTargets', 'getExportStatus'] as const;
const SUPPORTED_JOBS = [
    'update-report-datasets',
    'update-report-dataset-for-account',
    'sync-ad-entities',
    'update-report-status',
    'summarize-daily-target-stream',
    'summarize-daily-target-stream-for-account',
    'summarize-hourly-target-stream',
    'summarize-hourly-target-stream-for-account',
] as const;
const PERFORMANCE_RANGES = ['today', 'yesterday', 'this_week', 'this_month', 'this_year', 'last_30_days', 'last_6_months', 'last_12_months', 'all_time'] as const;

export const metricsRouter = router({
    adsApi: protectedProcedure
        .input(
            z.object({
                from: z.string().datetime(),
                to: z.string().datetime(),
                apiName: z.string().optional(),
            })
        )
        .query(async ({ ctx, input }) => {
            // Only show operational metrics to users with account access
            if (ctx.accessibleAccountIds.length === 0) {
                return { data: [], apiNames: [...SUPPORTED_APIS] };
            }

            const from = new Date(input.from);
            const to = new Date(input.to);

            const conditions = [gte(apiMetrics.timestamp, from), lte(apiMetrics.timestamp, to)];

            if (input.apiName) {
                conditions.push(eq(apiMetrics.apiName, input.apiName));
            }

            // Query for 5-minute intervals (only returns intervals with data)
            const data = await db
                .select({
                    interval: sql<string>`date_trunc('hour', ${apiMetrics.timestamp}) + floor(extract(minute from ${apiMetrics.timestamp}) / 5) * interval '5 minutes'`.as('interval'),
                    apiName: apiMetrics.apiName,
                    count: sql<number>`count(*)`.as('count'),
                    avgDuration: sql<number>`avg(${apiMetrics.durationMs})`.as('avg_duration'),
                    successCount: sql<number>`sum(case when ${apiMetrics.success} then 1 else 0 end)`.as('success_count'),
                    errorCount: sql<number>`sum(case when ${apiMetrics.success} then 0 else 1 end)`.as('error_count'),
                })
                .from(apiMetrics)
                .where(and(...conditions))
                .groupBy(sql`date_trunc('hour', ${apiMetrics.timestamp}) + floor(extract(minute from ${apiMetrics.timestamp}) / 5) * interval '5 minutes'`, apiMetrics.apiName)
                .orderBy(sql`date_trunc('hour', ${apiMetrics.timestamp}) + floor(extract(minute from ${apiMetrics.timestamp}) / 5) * interval '5 minutes'`, sql`${apiMetrics.apiName}`);

            // Query for 429s aggregated per 5-minute interval (all APIs combined)
            const rateLimitedData = await db
                .select({
                    interval: sql<string>`date_trunc('hour', ${apiMetrics.timestamp}) + floor(extract(minute from ${apiMetrics.timestamp}) / 5) * interval '5 minutes'`.as('interval'),
                    count: sql<number>`count(*)`.as('count'),
                })
                .from(apiMetrics)
                .where(and(...conditions, eq(apiMetrics.statusCode, 429)))
                .groupBy(sql`date_trunc('hour', ${apiMetrics.timestamp}) + floor(extract(minute from ${apiMetrics.timestamp}) / 5) * interval '5 minutes'`)
                .orderBy(sql`date_trunc('hour', ${apiMetrics.timestamp}) + floor(extract(minute from ${apiMetrics.timestamp}) / 5) * interval '5 minutes'`);

            // Build a map: interval -> apiName -> data
            const dataMap = new Map<string, Map<string, { count: number; avgDuration: number; successCount: number; errorCount: number }>>();
            for (const row of data) {
                const interval = new Date(row.interval).toISOString();
                let intervalMap = dataMap.get(interval);
                if (!intervalMap) {
                    intervalMap = new Map();
                    dataMap.set(interval, intervalMap);
                }
                intervalMap.set(row.apiName, {
                    count: Number(row.count),
                    avgDuration: Math.round(Number(row.avgDuration)),
                    successCount: Number(row.successCount),
                    errorCount: Number(row.errorCount),
                });
            }

            // Build a map: interval ISO string -> 429 count
            const rateLimitedMap = new Map<string, number>();
            for (const row of rateLimitedData) {
                const interval = new Date(row.interval).toISOString();
                rateLimitedMap.set(interval, Number(row.count));
            }

            // Generate all 5-minute intervals from `from` to `to`, filling with zeros
            const roundedFrom = new Date(from);
            roundedFrom.setMinutes(Math.floor(roundedFrom.getMinutes() / 5) * 5, 0, 0);
            const roundedTo = new Date(to);
            roundedTo.setMinutes(Math.floor(roundedTo.getMinutes() / 5) * 5, 0, 0);

            const chartData: Array<{
                interval: string;
                timestamp: string;
                [apiName: string]: string | number;
            }> = [];

            for (let ts = roundedFrom.getTime(); ts <= roundedTo.getTime(); ts += 5 * 60 * 1000) {
                const date = new Date(ts);
                const interval = date.toISOString();
                const point: { interval: string; timestamp: string; [apiName: string]: string | number } = {
                    interval: date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
                    timestamp: interval,
                };

                // Add count for each API (0 if no data)
                const intervalData = dataMap.get(interval);
                for (const apiName of SUPPORTED_APIS) {
                    point[apiName] = intervalData?.get(apiName)?.count ?? 0;
                }

                // Add 429 count (aggregated across all APIs)
                point['429'] = rateLimitedMap.get(interval) ?? 0;

                chartData.push(point);
            }

            return {
                data: chartData,
                apiNames: [...SUPPORTED_APIS],
            };
        }),
    job: protectedProcedure
        .input(
            z.object({
                from: z.string().datetime(),
                to: z.string().datetime(),
                jobName: z.string().optional(),
            })
        )
        .query(async ({ ctx, input }) => {
            // Only show operational metrics to users with account access
            if (ctx.accessibleAccountIds.length === 0) {
                return { data: {}, jobNames: [...SUPPORTED_JOBS], from: input.from, to: input.to };
            }

            const from = new Date(input.from);
            const to = new Date(input.to);

            const conditions = [isNotNull(jobMetrics.finishedAt), gte(jobMetrics.finishedAt, from), lte(jobMetrics.finishedAt, to)];

            if (input.jobName) {
                conditions.push(eq(jobMetrics.jobName, input.jobName));
            }

            const data = await db
                .select({
                    interval: sql<string>`date_trunc('hour', ${jobMetrics.finishedAt}) + floor(extract(minute from ${jobMetrics.finishedAt}) / 5) * interval '5 minutes'`.as('interval'),
                    jobName: jobMetrics.jobName,
                    count: sql<number>`count(*)`.as('count'),
                    avgDuration: sql<number>`avg(extract(epoch from (${jobMetrics.finishedAt} - ${jobMetrics.startedAt})) * 1000)`.as('avg_duration'),
                    successCount: sql<number>`sum(case when ${jobMetrics.status} = 'succeeded' then 1 else 0 end)`.as('success_count'),
                    errorCount: sql<number>`sum(case when ${jobMetrics.status} = 'failed' then 1 else 0 end)`.as('error_count'),
                })
                .from(jobMetrics)
                .where(and(...conditions))
                .groupBy(sql`date_trunc('hour', ${jobMetrics.finishedAt}) + floor(extract(minute from ${jobMetrics.finishedAt}) / 5) * interval '5 minutes'`, jobMetrics.jobName)
                .orderBy(sql`date_trunc('hour', ${jobMetrics.finishedAt}) + floor(extract(minute from ${jobMetrics.finishedAt}) / 5) * interval '5 minutes'`, sql`${jobMetrics.jobName}`);

            const chartData: Record<string, Array<{ interval: string; count: number; avgDuration: number; successCount: number; errorCount: number }>> = {};

            for (const jobName of SUPPORTED_JOBS) {
                chartData[jobName] = [];
            }

            for (const row of data) {
                const interval = new Date(row.interval).toISOString();
                if (!chartData[row.jobName]) {
                    chartData[row.jobName] = [];
                }
                chartData[row.jobName].push({
                    interval,
                    count: Number(row.count),
                    avgDuration: Math.round(Number(row.avgDuration)),
                    successCount: Number(row.successCount),
                    errorCount: Number(row.errorCount),
                });
            }

            const jobNames = [...SUPPORTED_JOBS];

            return {
                data: chartData,
                jobNames,
                from: from.toISOString(),
                to: to.toISOString(),
            };
        }),
    events: protectedProcedure
        .input(
            z.object({
                accountId: z.string(),
                countryCode: z.string(),
                from: z.string().datetime(),
                to: z.string().datetime(),
                filterFrom: z.string().datetime().optional(),
                filterTo: z.string().datetime().optional(),
                limit: z.number().min(1).max(200).default(100),
                jobName: z.string().optional(),
            })
        )
        .query(async ({ ctx, input }) => {
            ctx.assertAccountAccess(input.accountId);

            if (ctx.accessibleAccountIds.length === 0) {
                return { events: [], histogram: [], timezone: getTimezoneForCountry(input.countryCode), from: input.from, to: input.to };
            }

            const limit = input.limit ?? 100;
            const from = new Date(input.from);
            const to = new Date(input.to);
            const listFrom = input.filterFrom ? new Date(input.filterFrom) : from;
            const listTo = input.filterTo ? new Date(input.filterTo) : to;

            const baseConditions = [eq(events.accountId, input.accountId), eq(events.countryCode, input.countryCode)];

            if (input.jobName) {
                baseConditions.push(eq(events.jobName, input.jobName));
            }

            const listConditions = [...baseConditions, gte(events.createdAt, listFrom), lte(events.createdAt, listTo)];
            const histogramConditions = [...baseConditions, gte(events.createdAt, from), lte(events.createdAt, to)];

            const rows = await db
                .select({
                    id: events.id,
                    jobName: events.jobName,
                    outcome: events.outcome,
                    message: events.message,
                    badges: events.badges,
                    payload: events.payload,
                    createdAt: events.createdAt,
                })
                .from(events)
                .where(and(...listConditions))
                .orderBy(desc(events.createdAt))
                .limit(limit);

            const bucketRows = await db
                .select({
                    interval: sql<string>`date_trunc('hour', ${events.createdAt}) + floor(extract(minute from ${events.createdAt}) / 5) * interval '5 minutes'`.as(
                        'interval'
                    ),
                    count: sql<number>`count(*)`.as('count'),
                })
                .from(events)
                .where(and(...histogramConditions))
                .groupBy(sql`date_trunc('hour', ${events.createdAt}) + floor(extract(minute from ${events.createdAt}) / 5) * interval '5 minutes'`)
                .orderBy(sql`date_trunc('hour', ${events.createdAt}) + floor(extract(minute from ${events.createdAt}) / 5) * interval '5 minutes'`);

            const roundedFrom = new Date(from);
            roundedFrom.setSeconds(0, 0);
            roundedFrom.setMinutes(Math.floor(roundedFrom.getMinutes() / 5) * 5);
            const roundedTo = new Date(to);
            roundedTo.setSeconds(0, 0);
            roundedTo.setMinutes(Math.ceil(roundedTo.getMinutes() / 5) * 5);

            const bucketMap = new Map<string, number>();
            for (const row of bucketRows) {
                const interval = new Date(row.interval).toISOString();
                bucketMap.set(interval, Number(row.count));
            }

            const histogram: Array<{ interval: string; count: number }> = [];
            for (let ts = roundedFrom.getTime(); ts <= roundedTo.getTime(); ts += 5 * 60 * 1000) {
                const date = new Date(ts);
                const interval = date.toISOString();
                histogram.push({
                    interval,
                    count: bucketMap.get(interval) ?? 0,
                });
            }

            return {
                events: rows.map(row => ({
                    id: row.id,
                    jobName: row.jobName,
                    outcome: row.outcome,
                    message: row.message ?? null,
                    badges: (row.badges ?? null) as string[] | null,
                    payload: (row.payload ?? null) as Record<string, unknown> | null,
                    createdAt: row.createdAt.toISOString(),
                })),
                histogram,
                timezone: getTimezoneForCountry(input.countryCode),
                from: roundedFrom.toISOString(),
                to: roundedTo.toISOString(),
            };
        }),
    ams: protectedProcedure
        .input(
            z.object({
                from: z.string().datetime(),
                to: z.string().datetime(),
            })
        )
        .query(async ({ ctx, input }) => {
            // Only show operational metrics to users with account access
            if (ctx.accessibleAccountIds.length === 0) {
                return { data: {}, entityTypes: [] };
            }

            const from = new Date(input.from);
            const to = new Date(input.to);

            const data = await db
                .select({
                    interval: sql<string>`date_trunc('hour', ${amsMetrics.timestamp}) + floor(extract(minute from ${amsMetrics.timestamp}) / 5) * interval '5 minutes'`.as('interval'),
                    entityType: amsMetrics.entityType,
                    count: sql<number>`count(*)`.as('count'),
                })
                .from(amsMetrics)
                .where(and(gte(amsMetrics.timestamp, from), lte(amsMetrics.timestamp, to)))
                .groupBy(sql`date_trunc('hour', ${amsMetrics.timestamp}) + floor(extract(minute from ${amsMetrics.timestamp}) / 5) * interval '5 minutes'`, amsMetrics.entityType)
                .orderBy(sql`date_trunc('hour', ${amsMetrics.timestamp}) + floor(extract(minute from ${amsMetrics.timestamp}) / 5) * interval '5 minutes'`, sql`${amsMetrics.entityType}`);

            const entityTypes = ['campaign', 'adGroup', 'ad', 'target', 'spTraffic', 'spConversion', 'budgetUsage'] as const;

            const chartData: Record<string, Array<{ interval: string; count: number }>> = {};

            for (const entityType of entityTypes) {
                chartData[entityType] = [];
            }

            for (const row of data) {
                const interval = new Date(row.interval).toISOString();
                if (!chartData[row.entityType]) {
                    chartData[row.entityType] = [];
                }
                chartData[row.entityType].push({
                    interval,
                    count: Number(row.count),
                });
            }

            return {
                data: chartData,
                entityTypes: [...entityTypes],
            };
        }),
    aggregation: protectedProcedure
        .input(
            z.object({
                from: z.string().datetime(),
                to: z.string().datetime(),
            })
        )
        .query(async ({ ctx, input }) => {
            // Only show operational metrics to users with account access
            if (ctx.accessibleAccountIds.length === 0) {
                return { data: [] };
            }

            const from = new Date(input.from);
            const to = new Date(input.to);

            const data = await db
                .select({
                    interval: sql<string>`date_trunc('hour', ${events.createdAt}) + floor(extract(minute from ${events.createdAt}) / 5) * interval '5 minutes'`.as('interval'),
                    jobCount: sql<number>`count(*)`.as('job_count'),
                    totalRowsInserted: sql<number>`COALESCE(sum(COALESCE((${events.payload} ->> 'rowsInserted')::int, 0)), 0)`.as('total_rows_inserted'),
                })
                .from(events)
                .where(
                    and(
                        eq(events.jobName, 'summarize-daily-target-stream-for-account'),
                        eq(events.outcome, 'ok'),
                        gte(events.createdAt, from),
                        lte(events.createdAt, to)
                    )
                )
                .groupBy(sql`date_trunc('hour', ${events.createdAt}) + floor(extract(minute from ${events.createdAt}) / 5) * interval '5 minutes'`)
                .orderBy(sql`date_trunc('hour', ${events.createdAt}) + floor(extract(minute from ${events.createdAt}) / 5) * interval '5 minutes'`);

            const chartData = data.map(row => ({
                interval: new Date(row.interval).toISOString(),
                jobCount: Number(row.jobCount),
                totalRowsInserted: Number(row.totalRowsInserted) || 0,
            }));

            return {
                data: chartData,
            };
        }),
    amsHourly: protectedProcedure
        .input(
            z.object({
                from: z.string().datetime(),
                to: z.string().datetime(),
            })
        )
        .query(async ({ ctx, input }) => {
            // Only show operational metrics to users with account access
            if (ctx.accessibleAccountIds.length === 0) {
                return { data: {}, entityTypes: [] };
            }

            const from = new Date(input.from);
            const to = new Date(input.to);

            const data = await db
                .select({
                    interval: sql<string>`date_trunc('hour', ${amsMetrics.timestamp})`.as('interval'),
                    entityType: amsMetrics.entityType,
                    count: sql<number>`count(*)`.as('count'),
                })
                .from(amsMetrics)
                .where(and(gte(amsMetrics.timestamp, from), lte(amsMetrics.timestamp, to)))
                .groupBy(sql`date_trunc('hour', ${amsMetrics.timestamp})`, amsMetrics.entityType)
                .orderBy(sql`date_trunc('hour', ${amsMetrics.timestamp})`, sql`${amsMetrics.entityType}`);

            // We only care about these entity types for the metrics card
            const entityTypes = ['campaign', 'adGroup', 'ad', 'target', 'spTraffic', 'spConversion'] as const;

            const chartData: Record<string, Array<{ interval: string; count: number }>> = {};

            for (const entityType of entityTypes) {
                chartData[entityType] = [];
            }

            for (const row of data) {
                const interval = new Date(row.interval).toISOString();
                if (chartData[row.entityType]) {
                    chartData[row.entityType].push({
                        interval,
                        count: Number(row.count),
                    });
                }
            }

            return {
                data: chartData,
                entityTypes: [...entityTypes],
            };
        }),
    // Real-time AMS metrics with 5-minute granularity for the last 60 minutes
    amsRecent: protectedProcedure.query(async ({ ctx }) => {
        // Only show operational metrics to users with account access
        if (ctx.accessibleAccountIds.length === 0) {
            return { data: {}, entityTypes: [], lastActivity: {} };
        }

        const now = new Date();
        const from = new Date(now.getTime() - 60 * 60 * 1000); // 60 minutes ago

        const data = await db
            .select({
                // Truncate to 5-minute intervals
                interval: sql<string>`date_trunc('hour', ${amsMetrics.timestamp}) + 
                    INTERVAL '5 minutes' * FLOOR(EXTRACT(MINUTE FROM ${amsMetrics.timestamp}) / 5)`.as('interval'),
                entityType: amsMetrics.entityType,
                count: sql<number>`count(*)`.as('count'),
            })
            .from(amsMetrics)
            .where(and(gte(amsMetrics.timestamp, from), lte(amsMetrics.timestamp, now)))
            .groupBy(
                sql`date_trunc('hour', ${amsMetrics.timestamp}) + 
                    INTERVAL '5 minutes' * FLOOR(EXTRACT(MINUTE FROM ${amsMetrics.timestamp}) / 5)`,
                amsMetrics.entityType
            )
            .orderBy(
                sql`date_trunc('hour', ${amsMetrics.timestamp}) + 
                    INTERVAL '5 minutes' * FLOOR(EXTRACT(MINUTE FROM ${amsMetrics.timestamp}) / 5)`
            );

        const entityTypes = ['campaign', 'adGroup', 'ad', 'target', 'spTraffic', 'spConversion'] as const;

        const chartData: Record<string, Array<{ interval: string; count: number }>> = {};
        for (const entityType of entityTypes) {
            chartData[entityType] = [];
        }

        for (const row of data) {
            const interval = new Date(row.interval).toISOString();
            if (chartData[row.entityType]) {
                chartData[row.entityType].push({
                    interval,
                    count: Number(row.count),
                });
            }
        }

        // Also return the last message timestamp for each entity type
        const lastActivity = await db
            .select({
                entityType: amsMetrics.entityType,
                lastTimestamp: sql<string>`max(${amsMetrics.timestamp})`.as('last_timestamp'),
            })
            .from(amsMetrics)
            .where(gte(amsMetrics.timestamp, from))
            .groupBy(amsMetrics.entityType);

        const lastActivityMap: Record<string, string> = {};
        for (const row of lastActivity) {
            lastActivityMap[row.entityType] = new Date(row.lastTimestamp).toISOString();
        }

        return {
            data: chartData,
            entityTypes: [...entityTypes],
            lastActivity: lastActivityMap,
        };
    }),
    dailyPerformance: protectedProcedure
        .input(
            z.object({
                accountId: z.string(),
                days: z.number().min(1).max(30).default(14),
            })
        )
        .query(async ({ ctx, input }) => {
            ctx.assertAccountAccess(input.accountId);
            // Calculate date range - last N days
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const startDate = new Date(today);
            startDate.setDate(startDate.getDate() - input.days + 1); // Include today, so - (days - 1)

            // Query aggregated daily performance data
            const data = await db
                .select({
                    bucketDate: performanceDaily.bucketDate,
                    impressions: sql<number>`sum(${performanceDaily.impressions})`.as('impressions'),
                    clicks: sql<number>`sum(${performanceDaily.clicks})`.as('clicks'),
                    orders: sql<number>`sum(${performanceDaily.orders})`.as('orders'),
                    spend: sql<string>`sum(${performanceDaily.spend})`.as('spend'),
                    sales: sql<string>`sum(${performanceDaily.sales})`.as('sales'),
                })
                .from(performanceDaily)
                .where(and(eq(performanceDaily.accountId, input.accountId), gte(performanceDaily.bucketDate, startDate.toISOString().split('T')[0]!)))
                .groupBy(performanceDaily.bucketDate)
                .orderBy(performanceDaily.bucketDate);

            // Build a map of bucketDate -> metrics
            const dataMap = new Map<string, { impressions: number; clicks: number; orders: number; spend: number; sales: number }>();
            for (const row of data) {
                const dateStr =
                    typeof row.bucketDate === 'string' ? row.bucketDate : (row.bucketDate as Date).toISOString().split('T')[0]!;
                dataMap.set(dateStr, {
                    impressions: Number(row.impressions),
                    clicks: Number(row.clicks),
                    orders: Number(row.orders),
                    spend: Number(row.spend),
                    sales: Number(row.sales),
                });
            }

            // Generate all days in range, filling missing days with zeros
            const chartData: Array<{
                bucketDate: string;
                impressions: number;
                clicks: number;
                orders: number;
                spend: number;
                acos: number;
                ctr: number;
                cpc: number;
            }> = [];

            for (let i = 0; i < input.days; i++) {
                const date = new Date(startDate);
                date.setDate(date.getDate() + i);
                const dateStr = date.toISOString().split('T')[0]!;

                const dayData = dataMap.get(dateStr) ?? {
                    impressions: 0,
                    clicks: 0,
                    orders: 0,
                    spend: 0,
                    sales: 0,
                };

                // Calculate derived metrics
                const acos = dayData.sales > 0 ? (dayData.spend / dayData.sales) * 100 : 0;
                const ctr = dayData.impressions > 0 ? (dayData.clicks / dayData.impressions) * 100 : 0;
                const cpc = dayData.clicks > 0 ? dayData.spend / dayData.clicks : 0;

                chartData.push({
                    bucketDate: dateStr,
                    impressions: dayData.impressions,
                    clicks: dayData.clicks,
                    orders: dayData.orders,
                    spend: dayData.spend,
                    acos,
                    ctr,
                    cpc,
                });
            }

            return {
                data: chartData,
            };
        }),
    hourlyPerformance: protectedProcedure
        .input(
            z.object({
                accountId: z.string(),
                timezone: z.string(), // Browser timezone - used for display
                range: z.enum(PERFORMANCE_RANGES).default('today'),
                customRange: z
                    .object({
                        start: z.string(),
                        end: z.string(),
                    })
                    .nullable()
                    .optional(),
            })
        )
        .query(async ({ ctx, input }) => {
            ctx.assertAccountAccess(input.accountId);
            const browserTimezone = input.timezone;
            const now = new Date();
            let allTimeStartUtc: Date | null = null;
            if (input.range === 'all_time' && !input.customRange) {
                const [earliest] = await db
                    .select({
                        firstSeen: sql<Date>`min(${performanceHourly.bucketStart})`.as('first_seen'),
                    })
                    .from(performanceHourly)
                    .where(eq(performanceHourly.accountId, input.accountId));

                allTimeStartUtc = earliest?.firstSeen ? new Date(earliest.firstSeen) : null;
            }

            const rangeResult = getPerformanceRange({
                range: input.range,
                timezone: browserTimezone,
                now,
                allTimeStartUtc,
                customRange: input.customRange ?? null,
            });

            const { rangeStartZoned, rangeEndZoned, rangeStartUtc, rangeEndUtc, rangeEndExclusiveUtc, granularity, shouldCompare, compareStartUtc, compareEndExclusiveUtc } =
                rangeResult;
            let previousTotals: { impressions: number; clicks: number; orders: number; spend: number; sales: number } | null = null;

            if (shouldCompare && compareStartUtc && compareEndExclusiveUtc) {
                const [previousTotalsRow] = await db
                    .select({
                        impressions: sql<number>`sum(${performanceHourly.impressions})`.as('impressions'),
                        clicks: sql<number>`sum(${performanceHourly.clicks})`.as('clicks'),
                        orders: sql<number>`sum(${performanceHourly.orders})`.as('orders'),
                        spend: sql<string>`sum(${performanceHourly.spend})`.as('spend'),
                        sales: sql<string>`sum(${performanceHourly.sales})`.as('sales'),
                    })
                    .from(performanceHourly)
                    .where(and(eq(performanceHourly.accountId, input.accountId), gte(performanceHourly.bucketStart, compareStartUtc), lt(performanceHourly.bucketStart, compareEndExclusiveUtc)));

                previousTotals = {
                    impressions: Number(previousTotalsRow?.impressions ?? 0),
                    clicks: Number(previousTotalsRow?.clicks ?? 0),
                    orders: Number(previousTotalsRow?.orders ?? 0),
                    spend: Number(previousTotalsRow?.spend ?? 0),
                    sales: Number(previousTotalsRow?.sales ?? 0),
                };
            }

            const tzLiteral = sql.raw(`'${browserTimezone.replace(/'/g, "''")}'`);
            const points: Array<{
                intervalStart: string;
                impressions: number;
                clicks: number;
                orders: number;
                spend: number;
                acos: number;
            }> = [];

            const totals = {
                impressions: 0,
                clicks: 0,
                orders: 0,
                spend: 0,
                sales: 0,
            };

            let leadingPoint: {
                intervalStart: string;
                impressions: number;
                clicks: number;
                orders: number;
                spend: number;
                acos: number;
            } | null = null;

            if (granularity === 'hour') {
                const hourlyData = await db
                    .select({
                        bucketHour: sql<number>`EXTRACT(HOUR FROM ${performanceHourly.bucketStart} AT TIME ZONE ${tzLiteral})::int`.as('bucket_hour'),
                        impressions: sql<number>`sum(${performanceHourly.impressions})`.as('impressions'),
                        clicks: sql<number>`sum(${performanceHourly.clicks})`.as('clicks'),
                        orders: sql<number>`sum(${performanceHourly.orders})`.as('orders'),
                        spend: sql<string>`sum(${performanceHourly.spend})`.as('spend'),
                        sales: sql<string>`sum(${performanceHourly.sales})`.as('sales'),
                    })
                    .from(performanceHourly)
                    .where(and(eq(performanceHourly.accountId, input.accountId), gte(performanceHourly.bucketStart, rangeStartUtc), lt(performanceHourly.bucketStart, rangeEndExclusiveUtc)))
                    .groupBy(sql`EXTRACT(HOUR FROM ${performanceHourly.bucketStart} AT TIME ZONE ${tzLiteral})`)
                    .orderBy(sql`EXTRACT(HOUR FROM ${performanceHourly.bucketStart} AT TIME ZONE ${tzLiteral})`);

                const hourlyMap = new Map<number, { impressions: number; clicks: number; orders: number; spend: number; sales: number }>();
                for (const row of hourlyData) {
                    hourlyMap.set(row.bucketHour, {
                        impressions: Number(row.impressions),
                        clicks: Number(row.clicks),
                        orders: Number(row.orders),
                        spend: Number(row.spend),
                        sales: Number(row.sales),
                    });
                }

                const dayStartZoned = startOfDay(rangeStartZoned);
                for (let hour = 0; hour < 24; hour++) {
                    const hourData = hourlyMap.get(hour) ?? {
                        impressions: 0,
                        clicks: 0,
                        orders: 0,
                        spend: 0,
                        sales: 0,
                    };

                    totals.impressions += hourData.impressions;
                    totals.clicks += hourData.clicks;
                    totals.orders += hourData.orders;
                    totals.spend += hourData.spend;
                    totals.sales += hourData.sales;

                    const acos = hourData.sales > 0 ? (hourData.spend / hourData.sales) * 100 : 0;
                    const hourStartZoned = addHours(dayStartZoned, hour);
                    const intervalStartUtc = fromZonedTime(hourStartZoned, browserTimezone);

                    points.push({
                        intervalStart: intervalStartUtc.toISOString(),
                        impressions: hourData.impressions,
                        clicks: hourData.clicks,
                        orders: hourData.orders,
                        spend: hourData.spend,
                        acos,
                    });
                }

                // Always include a leading point (even for custom ranges) so charts can render
                // a contextual lead-in and shift the visible window consistently.
                const previousHourStartZoned = addHours(dayStartZoned, -1);
                const previousHourStartUtc = fromZonedTime(previousHourStartZoned, browserTimezone);
                const previousHourEndUtc = fromZonedTime(addHours(previousHourStartZoned, 1), browserTimezone);

                const [previousHourRow] = await db
                    .select({
                        impressions: sql<number>`sum(${performanceHourly.impressions})`.as('impressions'),
                        clicks: sql<number>`sum(${performanceHourly.clicks})`.as('clicks'),
                        orders: sql<number>`sum(${performanceHourly.orders})`.as('orders'),
                        spend: sql<string>`sum(${performanceHourly.spend})`.as('spend'),
                        sales: sql<string>`sum(${performanceHourly.sales})`.as('sales'),
                    })
                    .from(performanceHourly)
                    .where(and(eq(performanceHourly.accountId, input.accountId), gte(performanceHourly.bucketStart, previousHourStartUtc), lt(performanceHourly.bucketStart, previousHourEndUtc)));

                const previousHourData = {
                    impressions: Number(previousHourRow?.impressions ?? 0),
                    clicks: Number(previousHourRow?.clicks ?? 0),
                    orders: Number(previousHourRow?.orders ?? 0),
                    spend: Number(previousHourRow?.spend ?? 0),
                    sales: Number(previousHourRow?.sales ?? 0),
                };

                const previousHourAcos = previousHourData.sales > 0 ? (previousHourData.spend / previousHourData.sales) * 100 : 0;

                leadingPoint = {
                    intervalStart: previousHourStartUtc.toISOString(),
                    impressions: previousHourData.impressions,
                    clicks: previousHourData.clicks,
                    orders: previousHourData.orders,
                    spend: previousHourData.spend,
                    acos: previousHourAcos,
                };
            }

            if (granularity === 'day' || granularity === 'month') {
                const intervalExpr =
                    granularity === 'day'
                        ? sql`date_trunc('day', ${performanceHourly.bucketStart} AT TIME ZONE ${tzLiteral})`
                        : sql`date_trunc('month', ${performanceHourly.bucketStart} AT TIME ZONE ${tzLiteral})`;
                const intervalLabel =
                    granularity === 'day'
                        ? sql<string>`to_char(${intervalExpr}, 'YYYY-MM-DD')`.as('interval')
                        : sql<string>`to_char(${intervalExpr}, 'YYYY-MM-01')`.as('interval');

                const groupedData = await db
                    .select({
                        interval: intervalLabel,
                        impressions: sql<number>`sum(${performanceHourly.impressions})`.as('impressions'),
                        clicks: sql<number>`sum(${performanceHourly.clicks})`.as('clicks'),
                        orders: sql<number>`sum(${performanceHourly.orders})`.as('orders'),
                        spend: sql<string>`sum(${performanceHourly.spend})`.as('spend'),
                        sales: sql<string>`sum(${performanceHourly.sales})`.as('sales'),
                    })
                    .from(performanceHourly)
                    .where(and(eq(performanceHourly.accountId, input.accountId), gte(performanceHourly.bucketStart, rangeStartUtc), lt(performanceHourly.bucketStart, rangeEndExclusiveUtc)))
                    .groupBy(intervalExpr)
                    .orderBy(intervalExpr);

                const groupedMap = new Map<string, { impressions: number; clicks: number; orders: number; spend: number; sales: number }>();
                for (const row of groupedData) {
                    groupedMap.set(row.interval, {
                        impressions: Number(row.impressions),
                        clicks: Number(row.clicks),
                        orders: Number(row.orders),
                        spend: Number(row.spend),
                        sales: Number(row.sales),
                    });
                }

                if (granularity === 'day') {
                    const startDay = startOfDay(rangeStartZoned);
                    const endDay = startOfDay(rangeEndZoned);

                    for (let cursor = startDay; cursor <= endDay; cursor = addDays(cursor, 1)) {
                        const key = format(cursor, 'yyyy-MM-dd');
                        const dayData = groupedMap.get(key) ?? { impressions: 0, clicks: 0, orders: 0, spend: 0, sales: 0 };

                        totals.impressions += dayData.impressions;
                        totals.clicks += dayData.clicks;
                        totals.orders += dayData.orders;
                        totals.spend += dayData.spend;
                        totals.sales += dayData.sales;

                        const acos = dayData.sales > 0 ? (dayData.spend / dayData.sales) * 100 : 0;
                        const intervalStartUtc = fromZonedTime(cursor, browserTimezone);

                        points.push({
                            intervalStart: intervalStartUtc.toISOString(),
                            impressions: dayData.impressions,
                            clicks: dayData.clicks,
                            orders: dayData.orders,
                            spend: dayData.spend,
                            acos,
                        });
                    }
                }

                if (granularity === 'month') {
                    const startMonth = startOfMonth(rangeStartZoned);
                    const endMonth = startOfMonth(rangeEndZoned);

                    for (let cursor = startMonth; cursor <= endMonth; cursor = addMonths(cursor, 1)) {
                        const key = format(cursor, 'yyyy-MM-01');
                        const monthData = groupedMap.get(key) ?? { impressions: 0, clicks: 0, orders: 0, spend: 0, sales: 0 };

                        totals.impressions += monthData.impressions;
                        totals.clicks += monthData.clicks;
                        totals.orders += monthData.orders;
                        totals.spend += monthData.spend;
                        totals.sales += monthData.sales;

                        const acos = monthData.sales > 0 ? (monthData.spend / monthData.sales) * 100 : 0;
                        const intervalStartUtc = fromZonedTime(cursor, browserTimezone);

                        points.push({
                            intervalStart: intervalStartUtc.toISOString(),
                            impressions: monthData.impressions,
                            clicks: monthData.clicks,
                            orders: monthData.orders,
                            spend: monthData.spend,
                            acos,
                        });
                    }
                }

                if (granularity === 'day') {
                    const leadingDayStartZoned = addDays(startOfDay(rangeStartZoned), -1);
                    const leadingDayStartUtc = fromZonedTime(leadingDayStartZoned, browserTimezone);
                    const leadingDayEndUtc = fromZonedTime(startOfDay(rangeStartZoned), browserTimezone);

                    const [leadingDayRow] = await db
                        .select({
                            impressions: sql<number>`sum(${performanceHourly.impressions})`.as('impressions'),
                            clicks: sql<number>`sum(${performanceHourly.clicks})`.as('clicks'),
                            orders: sql<number>`sum(${performanceHourly.orders})`.as('orders'),
                            spend: sql<string>`sum(${performanceHourly.spend})`.as('spend'),
                            sales: sql<string>`sum(${performanceHourly.sales})`.as('sales'),
                        })
                        .from(performanceHourly)
                        .where(and(eq(performanceHourly.accountId, input.accountId), gte(performanceHourly.bucketStart, leadingDayStartUtc), lt(performanceHourly.bucketStart, leadingDayEndUtc)));

                    const leadingDayData = {
                        impressions: Number(leadingDayRow?.impressions ?? 0),
                        clicks: Number(leadingDayRow?.clicks ?? 0),
                        orders: Number(leadingDayRow?.orders ?? 0),
                        spend: Number(leadingDayRow?.spend ?? 0),
                        sales: Number(leadingDayRow?.sales ?? 0),
                    };

                    const leadingDayAcos = leadingDayData.sales > 0 ? (leadingDayData.spend / leadingDayData.sales) * 100 : 0;

                    leadingPoint = {
                        intervalStart: leadingDayStartUtc.toISOString(),
                        impressions: leadingDayData.impressions,
                        clicks: leadingDayData.clicks,
                        orders: leadingDayData.orders,
                        spend: leadingDayData.spend,
                        acos: leadingDayAcos,
                    };
                }

                if (granularity === 'month') {
                    const rangeMonthStartZoned = startOfMonth(rangeStartZoned);
                    const leadingMonthStartZoned = startOfMonth(subMonths(rangeMonthStartZoned, 1));
                    const leadingMonthStartUtc = fromZonedTime(leadingMonthStartZoned, browserTimezone);
                    const leadingMonthEndUtc = fromZonedTime(rangeMonthStartZoned, browserTimezone);

                    const [leadingMonthRow] = await db
                        .select({
                            impressions: sql<number>`sum(${performanceHourly.impressions})`.as('impressions'),
                            clicks: sql<number>`sum(${performanceHourly.clicks})`.as('clicks'),
                            orders: sql<number>`sum(${performanceHourly.orders})`.as('orders'),
                            spend: sql<string>`sum(${performanceHourly.spend})`.as('spend'),
                            sales: sql<string>`sum(${performanceHourly.sales})`.as('sales'),
                        })
                        .from(performanceHourly)
                        .where(and(eq(performanceHourly.accountId, input.accountId), gte(performanceHourly.bucketStart, leadingMonthStartUtc), lt(performanceHourly.bucketStart, leadingMonthEndUtc)));

                    const leadingMonthData = {
                        impressions: Number(leadingMonthRow?.impressions ?? 0),
                        clicks: Number(leadingMonthRow?.clicks ?? 0),
                        orders: Number(leadingMonthRow?.orders ?? 0),
                        spend: Number(leadingMonthRow?.spend ?? 0),
                        sales: Number(leadingMonthRow?.sales ?? 0),
                    };

                    const leadingMonthAcos = leadingMonthData.sales > 0 ? (leadingMonthData.spend / leadingMonthData.sales) * 100 : 0;

                    leadingPoint = {
                        intervalStart: leadingMonthStartUtc.toISOString(),
                        impressions: leadingMonthData.impressions,
                        clicks: leadingMonthData.clicks,
                        orders: leadingMonthData.orders,
                        spend: leadingMonthData.spend,
                        acos: leadingMonthAcos,
                    };
                }
            }

            const totalAcos = totals.sales > 0 ? (totals.spend / totals.sales) * 100 : 0;
            const previousAcos = previousTotals && previousTotals.sales > 0 ? (previousTotals.spend / previousTotals.sales) * 100 : 0;

            const calculateChange = (current: number, previous: number) => {
                if (!shouldCompare) return 0;
                if (previous === 0) return current > 0 ? 100 : 0;
                return ((current - previous) / previous) * 100;
            };

            return {
                granularity,
                points,
                leadingPoint,
                range: {
                    start: rangeStartUtc.toISOString(),
                    end: rangeEndUtc.toISOString(),
                },
                totals: {
                    impressions: totals.impressions,
                    clicks: totals.clicks,
                    orders: totals.orders,
                    spend: totals.spend,
                    acos: totalAcos,
                },
                changes: {
                    impressions: calculateChange(totals.impressions, previousTotals?.impressions ?? 0),
                    clicks: calculateChange(totals.clicks, previousTotals?.clicks ?? 0),
                    orders: calculateChange(totals.orders, previousTotals?.orders ?? 0),
                    spend: calculateChange(totals.spend, previousTotals?.spend ?? 0),
                    acos: calculateChange(totalAcos, previousAcos),
                },
            };
        }),
    messageThroughput: protectedProcedure.query(async ({ ctx }) => {
        // Only show operational metrics to users with account access
        if (ctx.accessibleAccountIds.length === 0) {
            return { currentHourTotal: 0, previousHourTotal: 0, percentChange: 0, sparkline: [] };
        }

        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

        // Get total messages in last hour (current hour)
        const currentHourTotal = await db
            .select({
                count: sql<number>`count(*)`.as('count'),
            })
            .from(amsMetrics)
            .where(and(gte(amsMetrics.timestamp, oneHourAgo), lte(amsMetrics.timestamp, now)));

        // Get total messages in previous hour
        const previousHourTotal = await db
            .select({
                count: sql<number>`count(*)`.as('count'),
            })
            .from(amsMetrics)
            .where(and(gte(amsMetrics.timestamp, twoHoursAgo), lt(amsMetrics.timestamp, oneHourAgo)));

        // Get 5-minute interval data for sparkline (last 60 minutes)
        const sparklineData = await db
            .select({
                interval: sql<string>`date_trunc('hour', ${amsMetrics.timestamp}) + 
                    INTERVAL '5 minutes' * FLOOR(EXTRACT(MINUTE FROM ${amsMetrics.timestamp}) / 5)`.as('interval'),
                count: sql<number>`count(*)`.as('count'),
            })
            .from(amsMetrics)
            .where(and(gte(amsMetrics.timestamp, oneHourAgo), lte(amsMetrics.timestamp, now)))
            .groupBy(sql`date_trunc('hour', ${amsMetrics.timestamp}) + 
                INTERVAL '5 minutes' * FLOOR(EXTRACT(MINUTE FROM ${amsMetrics.timestamp}) / 5)`)
            .orderBy(sql`date_trunc('hour', ${amsMetrics.timestamp}) + 
                INTERVAL '5 minutes' * FLOOR(EXTRACT(MINUTE FROM ${amsMetrics.timestamp}) / 5)`);

        // Generate all 12 five-minute intervals for the last 60 minutes
        const intervals: string[] = [];
        for (let i = 11; i >= 0; i--) {
            const interval = new Date(now.getTime() - i * 5 * 60 * 1000);
            interval.setMinutes(Math.floor(interval.getMinutes() / 5) * 5, 0, 0);
            intervals.push(interval.toISOString());
        }

        // Build sparkline array with zeros filled
        const sparklineMap = new Map<string, number>();
        for (const row of sparklineData) {
            sparklineMap.set(new Date(row.interval).toISOString(), Number(row.count));
        }

        const sparkline = intervals.map(i => sparklineMap.get(i) ?? 0);

        const currentCount = Number(currentHourTotal[0]?.count ?? 0);
        const previousCount = Number(previousHourTotal[0]?.count ?? 0);

        // Calculate percent change
        const percentChange = previousCount === 0 ? (currentCount > 0 ? 100 : 0) : ((currentCount - previousCount) / previousCount) * 100;

        return {
            currentHourTotal: currentCount,
            previousHourTotal: previousCount,
            percentChange,
            sparkline,
        };
    }),
    apiHealth: protectedProcedure.query(async ({ ctx }) => {
        // Only show operational metrics to users with account access
        if (ctx.accessibleAccountIds.length === 0) {
            return { successRate: 100, total: 0, successCount: 0, errorCount: 0, rateLimitCount: 0 };
        }

        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        // Get total API calls, success count, and 429 count in last hour
        const healthData = await db
            .select({
                total: sql<number>`count(*)`.as('total'),
                successCount: sql<number>`sum(case when ${apiMetrics.success} then 1 else 0 end)`.as('success_count'),
                errorCount: sql<number>`sum(case when ${apiMetrics.success} then 0 else 1 end)`.as('error_count'),
                rateLimitCount: sql<number>`sum(case when ${apiMetrics.statusCode} = 429 then 1 else 0 end)`.as('rate_limit_count'),
            })
            .from(apiMetrics)
            .where(and(gte(apiMetrics.timestamp, oneHourAgo), lte(apiMetrics.timestamp, now)));

        const total = Number(healthData[0]?.total ?? 0);
        const successCount = Number(healthData[0]?.successCount ?? 0);
        const errorCount = Number(healthData[0]?.errorCount ?? 0);
        const rateLimitCount = Number(healthData[0]?.rateLimitCount ?? 0);

        const successRate = total > 0 ? (successCount / total) * 100 : 100;

        return {
            successRate,
            total,
            successCount,
            errorCount,
            rateLimitCount,
        };
    }),
});
