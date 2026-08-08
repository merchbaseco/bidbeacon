import { z } from 'zod';

const dateStringSchema = z.string().regex(/^\d{2}-\d{2}-\d{4}$/);

export const PERFORMANCE_DIMENSIONS = ['campaign', 'adGroup', 'ad', 'target'] as const;
export const performanceDimensionEnum = z.enum(PERFORMANCE_DIMENSIONS);
export type PerformanceDimension = z.infer<typeof performanceDimensionEnum>;

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const sortDirectionEnum = z.enum(SORT_DIRECTIONS);
export type SortDirection = z.infer<typeof sortDirectionEnum>;

export const SORT_FIELDS = ['impressions', 'clicks', 'purchases', 'spend', 'sales', 'ctr', 'cpc', 'roas', 'acos'] as const;
export const sortFieldEnum = z.enum(SORT_FIELDS);
export type SortField = z.infer<typeof sortFieldEnum>;

export const performanceRangeSchema = z.object({
    startDate: dateStringSchema,
    endDate: dateStringSchema,
});

export const performanceTableFiltersSchema = z
    .object({
        search: z.string().optional(),
        state: z.string().optional(),
        adProduct: z.string().optional(),
        campaignId: z.string().optional(),
        adGroupId: z.string().optional(),
        negative: z.boolean().optional(),
        targetType: z.string().optional(),
        targetMatchType: z.string().optional(),
    })
    .optional();

export const performanceTableInputSchema = z.object({
    accountId: z.string(),
    range: performanceRangeSchema,
    dimension: performanceDimensionEnum,
    filters: performanceTableFiltersSchema,
    sort: z
        .object({
            field: sortFieldEnum,
            direction: sortDirectionEnum,
        })
        .optional(),
    pagination: z
        .object({
            limit: z.number().min(1).max(200).default(50),
            cursor: z.string().optional(),
        })
        .optional(),
});

export const metricsSchema = z.object({
    impressions: z.number(),
    clicks: z.number(),
    purchases: z.number(),
    spend: z.number(),
    sales: z.number(),
    ctr: z.number(),
    cpc: z.number(),
    roas: z.number(),
    acos: z.number(),
});

export const campaignRowSchema = z.object({
    dimension: z.literal('campaign'),
    campaignId: z.string(),
    name: z.string(),
    state: z.string(),
    adProduct: z.string(),
    startDate: z.string(),
    endDate: z.string().nullable(),
    metrics: metricsSchema,
});

export const adGroupRowSchema = z.object({
    dimension: z.literal('adGroup'),
    adGroupId: z.string(),
    campaignId: z.string(),
    campaignName: z.string().nullable(),
    name: z.string(),
    state: z.string(),
    adProduct: z.string(),
    metrics: metricsSchema,
});

export const adRowSchema = z.object({
    dimension: z.literal('ad'),
    adId: z.string(),
    campaignId: z.string(),
    campaignName: z.string().nullable(),
    adGroupId: z.string(),
    adGroupName: z.string().nullable(),
    adProduct: z.string(),
    adType: z.string(),
    state: z.string(),
    productAsin: z.string().nullable(),
    metrics: metricsSchema,
});

export const targetRowSchema = z.object({
    dimension: z.literal('target'),
    targetId: z.string(),
    campaignId: z.string(),
    campaignName: z.string().nullable(),
    adGroupId: z.string().nullable(),
    adGroupName: z.string().nullable(),
    state: z.string(),
    negative: z.boolean(),
    targetType: z.string(),
    targetMatchType: z.string().nullable(),
    targetKeyword: z.string().nullable(),
    targetAsin: z.string().nullable(),
    targetDisplay: z.string(),
    metrics: metricsSchema,
});

export const performanceTableRowSchema = z.discriminatedUnion('dimension', [campaignRowSchema, adGroupRowSchema, adRowSchema, targetRowSchema]);

export const performanceTableOutputSchema = z.object({
    rows: z.array(performanceTableRowSchema),
    nextCursor: z.string().nullable(),
});

export type PerformanceTableInput = z.infer<typeof performanceTableInputSchema>;
export type PerformanceTableOutput = z.infer<typeof performanceTableOutputSchema>;
