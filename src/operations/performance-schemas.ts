import { z } from 'zod';
import { accountIdSchema } from './operation-schema';

export const PERFORMANCE_METRICS = ['impressions', 'clicks', 'spend', 'orders', 'sales', 'acos', 'cpc', 'ctr', 'roas', 'cvr'] as const;
export const PERFORMANCE_INTERVALS = ['hour', 'day', 'month'] as const;

const dateRangeSchema = z
    .object({
        startDate: z.string(),
        endDate: z.string(),
    })
    .strict();

const sharedInputShape = {
    accountId: accountIdSchema,
    interval: z.enum(PERFORMANCE_INTERVALS),
    dateRange: dateRangeSchema,
    metrics: z.array(z.enum(PERFORMANCE_METRICS)).min(1),
} as const;

export const performanceInputSchema = z
    .object({
        ...sharedInputShape,
        dimension: z.enum(['account', 'product']),
        entityIds: z.array(z.string().trim().min(1)).min(1).max(25).optional(),
    })
    .strict();

const metricValuesSchema = z.record(z.enum(PERFORMANCE_METRICS), z.number().nullable());

const coverageIssueSchema = z.union([
    z.object({ date: z.string(), status: z.enum(['PENDING', 'FAILED', 'UNKNOWN']) }).strict(),
    z.object({ date: z.string(), status: z.literal('PARSE_ERRORS'), errorCount: z.number().int().nonnegative() }).strict(),
]);

const contextSchema = z
    .object({
        account: z.object({ id: accountIdSchema, timezone: z.string(), currency: z.string() }).strict(),
        dimension: z.enum(['account', 'product']),
        interval: z.enum(PERFORMANCE_INTERVALS),
        metrics: z.array(z.enum(PERFORMANCE_METRICS)),
        dateRange: dateRangeSchema,
        coverage: z.object({ status: z.enum(['COMPLETE', 'INCOMPLETE', 'UNKNOWN']), issues: z.array(coverageIssueSchema) }).strict(),
    })
    .strict();

const hourlyPointSchema = z.object({ start: z.string(), end: z.string(), metrics: metricValuesSchema }).strict();
const dailyPointSchema = z.object({ date: z.string(), metrics: metricValuesSchema }).strict();
const monthlyPointSchema = z.object({ month: z.string(), metrics: metricValuesSchema }).strict();
const pointSchema = z.union([hourlyPointSchema, dailyPointSchema, monthlyPointSchema]);

export const accountPerformanceOutputSchema = z
    .object({
        context: contextSchema.extend({ dimension: z.literal('account') }),
        totals: metricValuesSchema,
        points: z.array(pointSchema),
    })
    .strict();

export const productPerformanceOutputSchema = z
    .object({
        context: contextSchema.extend({ dimension: z.literal('product') }),
        series: z.array(
            z
                .object({
                    entityId: z.string(),
                    totals: metricValuesSchema,
                    points: z.array(pointSchema),
                })
                .strict()
        ),
    })
    .strict();

export const performanceOutputSchema = z.union([accountPerformanceOutputSchema, productPerformanceOutputSchema]);

export const performanceMcpOutputSchema = z
    .object({
        context: contextSchema,
        totals: metricValuesSchema.optional(),
        points: z.array(pointSchema).optional(),
        series: z
            .array(
                z
                    .object({
                        entityId: z.string(),
                        totals: metricValuesSchema,
                        points: z.array(pointSchema),
                    })
                    .strict()
            )
            .optional(),
    })
    .strict();

export type PerformanceInput = z.infer<typeof performanceInputSchema>;
export type PerformanceMetric = (typeof PERFORMANCE_METRICS)[number];
export type PerformanceInterval = (typeof PERFORMANCE_INTERVALS)[number];
