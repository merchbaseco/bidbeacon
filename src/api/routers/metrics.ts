import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { apiMetrics, jobMetrics } from '@/db/schema';
import { publicProcedure, router } from '../trpc';

const SUPPORTED_APIS = ['listAdvertiserAccounts', 'createReport', 'retrieveReport', 'exportCampaigns', 'exportAdGroups', 'exportAds', 'exportTargets', 'getExportStatus'] as const;
const SUPPORTED_JOBS = ['update-report-datasets', 'update-report-dataset-for-account', 'sync-ad-entities', 'refresh-report-datum'] as const;

export const metricsRouter = router({
    api: publicProcedure
        .input(
            z.object({
                from: z.string().datetime().optional(),
                to: z.string().datetime().optional(),
                apiName: z.string().optional(),
            })
        )
        .query(async ({ input }) => {
            const to = input.to ? new Date(input.to) : new Date();
            const from = input.from ? new Date(input.from) : new Date(to.getTime() - 3 * 60 * 60 * 1000);

            const conditions = [gte(apiMetrics.timestamp, from), lte(apiMetrics.timestamp, to)];

            if (input.apiName) {
                conditions.push(eq(apiMetrics.apiName, input.apiName));
            }

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

            const chartData: Record<string, Array<{ interval: string; count: number; avgDuration: number; successCount: number; errorCount: number }>> = {};

            for (const apiName of SUPPORTED_APIS) {
                chartData[apiName] = [];
            }

            for (const row of data) {
                const interval = new Date(row.interval).toISOString();
                if (!chartData[row.apiName]) {
                    chartData[row.apiName] = [];
                }
                chartData[row.apiName].push({
                    interval,
                    count: Number(row.count),
                    avgDuration: Math.round(Number(row.avgDuration)),
                    successCount: Number(row.successCount),
                    errorCount: Number(row.errorCount),
                });
            }

            const apiNames = [...SUPPORTED_APIS];

            return {
                data: chartData,
                apiNames,
                from: from.toISOString(),
                to: to.toISOString(),
            };
        }),
    job: publicProcedure
        .input(
            z.object({
                from: z.string().datetime().optional(),
                to: z.string().datetime().optional(),
                jobName: z.string().optional(),
            })
        )
        .query(async ({ input }) => {
            const to = input.to ? new Date(input.to) : new Date();
            const from = input.from ? new Date(input.from) : new Date(to.getTime() - 12 * 60 * 60 * 1000); // Default to 12 hours like dashboard

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
});
