import { and, desc, eq, gte, lt, lte, sql, isNotNull } from 'drizzle-orm';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { z } from 'zod';
import { db } from '@/db/index';
import { amsMetrics, apiMetrics, jobEvents, jobSessions, performanceDaily, performanceHourly } from '@/db/schema';
import { publicProcedure, router } from '../trpc';

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

export const metricsRouter = router({
    adsApi: publicProcedure
        .input(
            z.object({
                from: z.string().datetime(),
                to: z.string().datetime(),
                apiName: z.string().optional(),
            })
        )
        .query(async ({ input }) => {
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
    job: publicProcedure
        .input(
            z.object({
                from: z.string().datetime(),
                to: z.string().datetime(),
                jobName: z.string().optional(),
            })
        )
        .query(async ({ input }) => {
            const from = new Date(input.from);
            const to = new Date(input.to);

            const conditions = [isNotNull(jobSessions.finishedAt), gte(jobSessions.finishedAt, from), lte(jobSessions.finishedAt, to)];

            if (input.jobName) {
                conditions.push(eq(jobSessions.jobName, input.jobName));
            }

            const data = await db
                .select({
                    interval: sql<string>`date_trunc('hour', ${jobSessions.finishedAt}) + floor(extract(minute from ${jobSessions.finishedAt}) / 5) * interval '5 minutes'`.as('interval'),
                    jobName: jobSessions.jobName,
                    count: sql<number>`count(*)`.as('count'),
                    avgDuration: sql<number>`avg(${jobSessions.durationMs})`.as('avg_duration'),
                    successCount: sql<number>`sum(case when ${jobSessions.status} = 'succeeded' then 1 else 0 end)`.as('success_count'),
                    errorCount: sql<number>`sum(case when ${jobSessions.status} = 'failed' then 1 else 0 end)`.as('error_count'),
                })
                .from(jobSessions)
                .where(and(...conditions))
                .groupBy(sql`date_trunc('hour', ${jobSessions.finishedAt}) + floor(extract(minute from ${jobSessions.finishedAt}) / 5) * interval '5 minutes'`, jobSessions.jobName)
                .orderBy(sql`date_trunc('hour', ${jobSessions.finishedAt}) + floor(extract(minute from ${jobSessions.finishedAt}) / 5) * interval '5 minutes'`, sql`${jobSessions.jobName}`);

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
    jobEvents: publicProcedure
        .input(
            z
                .object({
                    limit: z.number().min(1).max(200).default(50),
                    jobName: z.string().optional(),
                    since: z.string().datetime().optional(),
                })
                .optional()
        )
        .query(async ({ input }) => {
            const limit = input?.limit ?? 50;
            const conditions = [];

            if (input?.jobName) {
                conditions.push(eq(jobEvents.jobName, input.jobName));
            }
            if (input?.since) {
                conditions.push(gte(jobEvents.occurredAt, new Date(input.since)));
            }

            const baseQuery = db
                .select({
                    id: jobEvents.id,
                    sessionId: jobEvents.sessionId,
                    jobName: jobEvents.jobName,
                    bossJobId: jobEvents.bossJobId,
                    occurredAt: jobEvents.occurredAt,
                    eventType: jobEvents.eventType,
                    headline: jobEvents.headline,
                    detail: jobEvents.detail,
                    stage: jobEvents.stage,
                    status: jobEvents.status,
                    durationMs: jobEvents.durationMs,
                    rowCount: jobEvents.rowCount,
                    retryCount: jobEvents.retryCount,
                    apiName: jobEvents.apiName,
                    accountId: jobEvents.accountId,
                    countryCode: jobEvents.countryCode,
                    datasetId: jobEvents.datasetId,
                    entityType: jobEvents.entityType,
                    aggregation: jobEvents.aggregation,
                    bucketDate: jobEvents.bucketDate,
                    bucketStart: jobEvents.bucketStart,
                    metadata: jobEvents.metadata,
                })
                .from(jobEvents);

            const queryWithFilters = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;

            const rows = await queryWithFilters.orderBy(desc(jobEvents.occurredAt)).limit(limit);

            return rows.map(row => ({
                id: row.id,
                sessionId: row.sessionId,
                jobName: row.jobName,
                bossJobId: row.bossJobId,
                occurredAt: row.occurredAt.toISOString(),
                eventType: row.eventType,
                headline: row.headline,
                detail: row.detail,
                stage: row.stage,
                status: row.status,
                durationMs: row.durationMs,
                rowCount: row.rowCount,
                retryCount: row.retryCount,
                apiName: row.apiName,
                accountId: row.accountId,
                countryCode: row.countryCode,
                datasetId: row.datasetId,
                entityType: row.entityType,
                aggregation: row.aggregation,
                bucketDate: row.bucketDate ? new Date(row.bucketDate).toISOString().slice(0, 10) : null,
                bucketStart: row.bucketStart ? row.bucketStart.toISOString() : null,
                metadata: (row.metadata ?? null) as Record<string, unknown> | null,
            }));
        }),
    ams: publicProcedure
        .input(
            z.object({
                from: z.string().datetime(),
                to: z.string().datetime(),
            })
        )
        .query(async ({ input }) => {
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
    aggregation: publicProcedure
        .input(
            z.object({
                from: z.string().datetime(),
                to: z.string().datetime(),
            })
        )
        .query(async ({ input }) => {
            const from = new Date(input.from);
            const to = new Date(input.to);

            const data = await db
                .select({
                    interval: sql<string>`date_trunc('hour', ${jobSessions.finishedAt}) + floor(extract(minute from ${jobSessions.finishedAt}) / 5) * interval '5 minutes'`.as('interval'),
                    jobCount: sql<number>`count(*)`.as('job_count'),
                    totalRowsInserted: sql<number>`COALESCE(sum(cast(${jobSessions.metadata}->>'totalRowsInserted' as integer)), 0)`.as('total_rows_inserted'),
                })
                .from(jobSessions)
                .where(
                    and(
                        eq(jobSessions.jobName, 'summarize-daily-target-stream-for-account'),
                        isNotNull(jobSessions.finishedAt),
                        gte(jobSessions.finishedAt, from),
                        lte(jobSessions.finishedAt, to)
                    )
                )
                .groupBy(sql`date_trunc('hour', ${jobSessions.finishedAt}) + floor(extract(minute from ${jobSessions.finishedAt}) / 5) * interval '5 minutes'`)
                .orderBy(sql`date_trunc('hour', ${jobSessions.finishedAt}) + floor(extract(minute from ${jobSessions.finishedAt}) / 5) * interval '5 minutes'`);

            const chartData = data.map(row => ({
                interval: new Date(row.interval).toISOString(),
                jobCount: Number(row.jobCount),
                totalRowsInserted: Number(row.totalRowsInserted) || 0,
            }));

            return {
                data: chartData,
            };
        }),
    amsHourly: publicProcedure
        .input(
            z.object({
                from: z.string().datetime(),
                to: z.string().datetime(),
            })
        )
        .query(async ({ input }) => {
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
    amsRecent: publicProcedure.query(async () => {
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
    dailyPerformance: publicProcedure
        .input(
            z.object({
                accountId: z.string(),
                days: z.number().min(1).max(30).default(14),
            })
        )
        .query(async ({ input }) => {
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
    hourlyPerformance: publicProcedure
        .input(
            z.object({
                accountId: z.string(),
                timezone: z.string(), // Browser timezone - used for display
            })
        )
        .query(async ({ input }) => {
            const browserTimezone = input.timezone;
            const now = new Date();

            // Calculate "today" in the browser's timezone as a UTC time range
            // This ensures we query the correct data regardless of account timezone
            const todayDateStr = formatInTimeZone(now, browserTimezone, 'yyyy-MM-dd');

            // Convert "midnight in browser timezone" to UTC using fromZonedTime
            // e.g., "2025-12-27 00:00 EST" → "2025-12-27 05:00 UTC"
            const todayStartUtc = fromZonedTime(`${todayDateStr}T00:00:00`, browserTimezone);
            const todayEndUtc = fromZonedTime(`${todayDateStr}T23:59:59`, browserTimezone);

            // Yesterday's boundaries (24 hours before today's boundaries)
            const yesterdayStartUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);
            const yesterdayEndUtc = new Date(todayEndUtc.getTime() - 24 * 60 * 60 * 1000);

            // Get current hour in the browser's timezone
            const currentHourInTimezone = parseInt(formatInTimeZone(now, browserTimezone, 'H'), 10);

            // Query today's hourly data using bucket_start (UTC) and group by hour in browser timezone
            // Use sql.raw() for timezone to avoid parameterization issues with AT TIME ZONE
            const tzLiteral = sql.raw(`'${browserTimezone.replace(/'/g, "''")}'`);
            const todayData = await db
                .select({
                    bucketHour: sql<number>`EXTRACT(HOUR FROM ${performanceHourly.bucketStart} AT TIME ZONE ${tzLiteral})::int`.as('bucket_hour'),
                    impressions: sql<number>`sum(${performanceHourly.impressions})`.as('impressions'),
                    clicks: sql<number>`sum(${performanceHourly.clicks})`.as('clicks'),
                    orders: sql<number>`sum(${performanceHourly.orders})`.as('orders'),
                    spend: sql<string>`sum(${performanceHourly.spend})`.as('spend'),
                    sales: sql<string>`sum(${performanceHourly.sales})`.as('sales'),
                })
                .from(performanceHourly)
                .where(
                    and(eq(performanceHourly.accountId, input.accountId), gte(performanceHourly.bucketStart, todayStartUtc), lt(performanceHourly.bucketStart, new Date(todayEndUtc.getTime() + 1000)))
                )
                .groupBy(sql`EXTRACT(HOUR FROM ${performanceHourly.bucketStart} AT TIME ZONE ${tzLiteral})`)
                .orderBy(sql`EXTRACT(HOUR FROM ${performanceHourly.bucketStart} AT TIME ZONE ${tzLiteral})`);

            // Query yesterday's aggregated data for comparison
            const [yesterdayTotals] = await db
                .select({
                    impressions: sql<number>`sum(${performanceHourly.impressions})`.as('impressions'),
                    clicks: sql<number>`sum(${performanceHourly.clicks})`.as('clicks'),
                    orders: sql<number>`sum(${performanceHourly.orders})`.as('orders'),
                    spend: sql<string>`sum(${performanceHourly.spend})`.as('spend'),
                    sales: sql<string>`sum(${performanceHourly.sales})`.as('sales'),
                })
                .from(performanceHourly)
                .where(
                    and(
                        eq(performanceHourly.accountId, input.accountId),
                        gte(performanceHourly.bucketStart, yesterdayStartUtc),
                        lt(performanceHourly.bucketStart, new Date(yesterdayEndUtc.getTime() + 1000))
                    )
                );

            // Query yesterday's last hour (hour 23 in browser timezone) for the leading bar
            const [yesterdayLastHour] = await db
                .select({
                    impressions: sql<number>`sum(${performanceHourly.impressions})`.as('impressions'),
                    clicks: sql<number>`sum(${performanceHourly.clicks})`.as('clicks'),
                    orders: sql<number>`sum(${performanceHourly.orders})`.as('orders'),
                    spend: sql<string>`sum(${performanceHourly.spend})`.as('spend'),
                    sales: sql<string>`sum(${performanceHourly.sales})`.as('sales'),
                })
                .from(performanceHourly)
                .where(
                    and(
                        eq(performanceHourly.accountId, input.accountId),
                        gte(performanceHourly.bucketStart, yesterdayStartUtc),
                        lt(performanceHourly.bucketStart, new Date(yesterdayEndUtc.getTime() + 1000)),
                        sql`EXTRACT(HOUR FROM ${performanceHourly.bucketStart} AT TIME ZONE ${tzLiteral}) = 23`
                    )
                );

            // Build hourly data map
            const hourlyMap = new Map<number, { impressions: number; clicks: number; orders: number; spend: number; sales: number }>();
            for (const row of todayData) {
                hourlyMap.set(row.bucketHour, {
                    impressions: Number(row.impressions),
                    clicks: Number(row.clicks),
                    orders: Number(row.orders),
                    spend: Number(row.spend),
                    sales: Number(row.sales),
                });
            }

            // Generate all 24 hours with zeros filled
            const hourlyChartData: Array<{
                hour: number;
                hourLabel: string;
                impressions: number;
                clicks: number;
                orders: number;
                spend: number;
                sales: number;
                acos: number;
            }> = [];

            // Calculate totals for today
            const todayTotals = {
                impressions: 0,
                clicks: 0,
                orders: 0,
                spend: 0,
                sales: 0,
            };

            for (let hour = 0; hour < 24; hour++) {
                const hourData = hourlyMap.get(hour) ?? {
                    impressions: 0,
                    clicks: 0,
                    orders: 0,
                    spend: 0,
                    sales: 0,
                };

                // Accumulate totals
                todayTotals.impressions += hourData.impressions;
                todayTotals.clicks += hourData.clicks;
                todayTotals.orders += hourData.orders;
                todayTotals.spend += hourData.spend;
                todayTotals.sales += hourData.sales;

                // Calculate ACoS for this hour
                const acos = hourData.sales > 0 ? (hourData.spend / hourData.sales) * 100 : 0;

                hourlyChartData.push({
                    hour,
                    hourLabel: `${hour.toString().padStart(2, '0')}:00`,
                    impressions: hourData.impressions,
                    clicks: hourData.clicks,
                    orders: hourData.orders,
                    spend: hourData.spend,
                    sales: hourData.sales,
                    acos,
                });
            }

            // Calculate derived metrics for totals
            const todayAcos = todayTotals.sales > 0 ? (todayTotals.spend / todayTotals.sales) * 100 : 0;

            // Calculate yesterday's derived metrics
            const yesterdayData = {
                impressions: Number(yesterdayTotals?.impressions ?? 0),
                clicks: Number(yesterdayTotals?.clicks ?? 0),
                orders: Number(yesterdayTotals?.orders ?? 0),
                spend: Number(yesterdayTotals?.spend ?? 0),
                sales: Number(yesterdayTotals?.sales ?? 0),
            };
            const yesterdayAcos = yesterdayData.sales > 0 ? (yesterdayData.spend / yesterdayData.sales) * 100 : 0;

            // Calculate percent changes
            const calculateChange = (today: number, yesterday: number) => {
                if (yesterday === 0) return today > 0 ? 100 : 0;
                return ((today - yesterday) / yesterday) * 100;
            };

            // Build yesterday's last hour data point
            const yesterdayLastHourData = {
                impressions: Number(yesterdayLastHour?.impressions ?? 0),
                clicks: Number(yesterdayLastHour?.clicks ?? 0),
                orders: Number(yesterdayLastHour?.orders ?? 0),
                spend: Number(yesterdayLastHour?.spend ?? 0),
                sales: Number(yesterdayLastHour?.sales ?? 0),
            };
            const yesterdayLastHourAcos = yesterdayLastHourData.sales > 0 ? (yesterdayLastHourData.spend / yesterdayLastHourData.sales) * 100 : 0;

            return {
                hourlyData: hourlyChartData,
                currentHour: currentHourInTimezone,
                // Yesterday's hour 23 as a leading bar (hour -1)
                leadingHour: {
                    hour: -1,
                    hourLabel: '23:00',
                    impressions: yesterdayLastHourData.impressions,
                    clicks: yesterdayLastHourData.clicks,
                    orders: yesterdayLastHourData.orders,
                    spend: yesterdayLastHourData.spend,
                    sales: yesterdayLastHourData.sales,
                    acos: yesterdayLastHourAcos,
                },
                totals: {
                    impressions: todayTotals.impressions,
                    clicks: todayTotals.clicks,
                    orders: todayTotals.orders,
                    spend: todayTotals.spend,
                    acos: todayAcos,
                },
                changes: {
                    impressions: calculateChange(todayTotals.impressions, yesterdayData.impressions),
                    clicks: calculateChange(todayTotals.clicks, yesterdayData.clicks),
                    orders: calculateChange(todayTotals.orders, yesterdayData.orders),
                    spend: calculateChange(todayTotals.spend, yesterdayData.spend),
                    acos: calculateChange(todayAcos, yesterdayAcos),
                },
            };
        }),
    messageThroughput: publicProcedure.query(async () => {
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
    apiHealth: publicProcedure.query(async () => {
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
