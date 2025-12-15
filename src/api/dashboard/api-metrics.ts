import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { apiMetrics } from '@/db/schema.js';

/**
 * Aggregates API metrics by hour and API name for charting.
 * Returns data grouped by hour and API name, suitable for line charts.
 */
export function registerApiMetricsRoute(fastify: FastifyInstance) {
    fastify.get('/api/dashboard/api-metrics', async (request, _reply) => {
        const querySchema = z.object({
            from: z.string().datetime().optional(), // ISO string
            to: z.string().datetime().optional(), // ISO string
            apiName: z.string().optional(), // Filter by specific API name
        });

        const query = querySchema.parse(request.query);

        // Default to last 3 hours if no range provided
        const to = query.to ? new Date(query.to) : new Date();
        const from = query.from ? new Date(query.from) : new Date(to.getTime() - 3 * 60 * 60 * 1000);

        const conditions = [gte(apiMetrics.timestamp, from), lte(apiMetrics.timestamp, to)];

        // Add API name filter if provided
        if (query.apiName) {
            conditions.push(eq(apiMetrics.apiName, query.apiName));
        }

        // Aggregate metrics by 5-minute intervals and API name
        // Round timestamp to nearest 5-minute interval
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

        // Transform data for chart consumption
        // Group by API name, then by interval
        const chartData: Record<string, Array<{ interval: string; count: number; avgDuration: number; successCount: number; errorCount: number }>> = {};

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

        // Get list of unique API names
        const apiNames = Object.keys(chartData).sort();

        return {
            success: true,
            data: chartData,
            apiNames,
            from: from.toISOString(),
            to: to.toISOString(),
        };
    });
}
