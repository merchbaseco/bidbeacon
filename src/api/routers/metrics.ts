import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { apiMetrics, jobMetrics } from '@/db/schema';
import { publicProcedure, router } from '../trpc';

const SUPPORTED_APIS = ['listAdvertiserAccounts', 'createReport', 'retrieveReport', 'exportCampaigns', 'exportAdGroups', 'exportAds', 'exportTargets', 'getExportStatus'] as const;
const SUPPORTED_JOBS = ['update-report-datasets', 'update-report-dataset-for-account', 'sync-ad-entities', 'update-report-status'] as const;

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

            // Build a map: interval -> apiName -> data
            const dataMap = new Map<string, Map<string, { count: number; avgDuration: number; successCount: number; errorCount: number }>>();
            for (const row of data) {
                const interval = new Date(row.interval).toISOString();
                if (!dataMap.has(interval)) {
                    dataMap.set(interval, new Map());
                }
                dataMap.get(interval)!.set(row.apiName, {
                    count: Number(row.count),
                    avgDuration: Math.round(Number(row.avgDuration)),
                    successCount: Number(row.successCount),
                    errorCount: Number(row.errorCount),
                });
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

            const conditions = [gte(jobMetrics.endTime, from), lte(jobMetrics.endTime, to)];

            if (input.jobName) {
                conditions.push(eq(jobMetrics.jobName, input.jobName));
            }

            const data = await db
                .select({
                    interval: sql<string>`date_trunc('hour', ${jobMetrics.endTime}) + floor(extract(minute from ${jobMetrics.endTime}) / 5) * interval '5 minutes'`.as('interval'),
                    jobName: jobMetrics.jobName,
                    count: sql<number>`count(*)`.as('count'),
                    avgDuration: sql<number>`avg(extract(epoch from (${jobMetrics.endTime} - ${jobMetrics.startTime})) * 1000)`.as('avg_duration'),
                    successCount: sql<number>`sum(case when ${jobMetrics.success} then 1 else 0 end)`.as('success_count'),
                    errorCount: sql<number>`sum(case when ${jobMetrics.success} then 0 else 1 end)`.as('error_count'),
                })
                .from(jobMetrics)
                .where(and(...conditions))
                .groupBy(sql`date_trunc('hour', ${jobMetrics.endTime}) + floor(extract(minute from ${jobMetrics.endTime}) / 5) * interval '5 minutes'`, jobMetrics.jobName)
                .orderBy(sql`date_trunc('hour', ${jobMetrics.endTime}) + floor(extract(minute from ${jobMetrics.endTime}) / 5) * interval '5 minutes'`, sql`${jobMetrics.jobName}`);

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
    adsApiThrottler: publicProcedure
        .input(
            z.object({
                from: z.string().datetime(),
                to: z.string().datetime(),
            })
        )
        .query(async ({ input }) => {
            const from = new Date(input.from);
            const to = new Date(input.to);

            const conditions = [gte(apiMetrics.timestamp, from), lte(apiMetrics.timestamp, to)];

            // Query for 5-minute intervals grouped by API name (only returns intervals with data)
            const data = await db
                .select({
                    interval: sql<string>`date_trunc('hour', ${apiMetrics.timestamp}) + floor(extract(minute from ${apiMetrics.timestamp}) / 5) * interval '5 minutes'`.as('interval'),
                    apiName: apiMetrics.apiName,
                    count: sql<number>`count(*)`.as('count'),
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

            // Build a map: interval ISO string -> apiName -> count
            const dataMap = new Map<string, Map<string, number>>();
            for (const row of data) {
                const interval = new Date(row.interval).toISOString();
                if (!dataMap.has(interval)) {
                    dataMap.set(interval, new Map());
                }
                dataMap.get(interval)!.set(row.apiName, Number(row.count));
            }

            // Build a map: interval ISO string -> 429 count
            const rateLimitedMap = new Map<string, number>();
            for (const row of rateLimitedData) {
                const interval = new Date(row.interval).toISOString();
                rateLimitedMap.set(interval, Number(row.count));
            }

            // Generate all 5-minute intervals from `from` to `to`, filling with zeros
            const chartData: Array<{
                timestamp: string;
                interval: string;
                [apiName: string]: string | number;
            }> = [];
            const roundedFrom = new Date(from);
            roundedFrom.setMinutes(Math.floor(roundedFrom.getMinutes() / 5) * 5, 0, 0);
            const roundedTo = new Date(to);
            roundedTo.setMinutes(Math.floor(roundedTo.getMinutes() / 5) * 5, 0, 0);

            for (let ts = roundedFrom.getTime(); ts <= roundedTo.getTime(); ts += 5 * 60 * 1000) {
                const date = new Date(ts);
                const isoInterval = date.toISOString();
                const point: { timestamp: string; interval: string; [apiName: string]: string | number } = {
                    timestamp: isoInterval,
                    interval: date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
                };

                // Add count for each API (0 if no data)
                const intervalData = dataMap.get(isoInterval);
                for (const apiName of SUPPORTED_APIS) {
                    point[apiName] = intervalData?.get(apiName) ?? 0;
                }

                // Add 429 count (aggregated across all APIs)
                point['429'] = rateLimitedMap.get(isoInterval) ?? 0;

                chartData.push(point);
            }

            return {
                data: chartData,
                apiNames: [...SUPPORTED_APIS],
            };
        }),
});
