import { z } from 'zod';

export const publicConfigSchema = z.object({
    accountId: z.string(),
    countryCode: z.string().optional(),
    range: z.string(),
});

export const publicConfigInputSchema = z.object({
    config: publicConfigSchema,
});

export const stateSchema = z.enum(['ENABLED', 'PAUSED', 'ARCHIVED', 'OTHER']);
export const listStateSchema = z.enum(['ENABLED', 'PAUSED', 'ARCHIVED', 'OTHER', 'ALL']);

export const publicListInputSchema = publicConfigInputSchema.extend({
    state: listStateSchema.optional(),
    limit: z.number().min(1).max(200).optional(),
    offset: z.number().min(0).optional(),
});

export const adGroupsListInputSchema = publicListInputSchema.extend({
    campaignId: z.string().optional(),
});

export const adsListInputSchema = publicListInputSchema.extend({
    campaignId: z.string().optional(),
    adGroupId: z.string().optional(),
    productAsin: z.string().optional(),
});

export const targetsListInputSchema = publicListInputSchema.extend({
    campaignId: z.string().optional(),
    adGroupId: z.string().optional(),
});
export const bidStrategySchema = z.enum(['MANUAL', 'RULE_BASED', 'SALES_DOWN_ONLY', 'SALES_UP_AND_DOWN', 'SALES', 'NEW_TO_BRAND', 'NONE']);
export const keywordMatchTypeSchema = z.enum(['BROAD', 'PHRASE', 'EXACT']);
export const productMatchTypeSchema = z.enum(['PRODUCT_EXACT', 'PRODUCT_SIMILAR']);
export const productIdTypeSchema = z.enum(['ASIN', 'SKU']);
export const placementSchema = z.enum(['HOME_PAGE', 'TOP_OF_SEARCH', 'REST_OF_SEARCH', 'PRODUCT_PAGE', 'SITE_AMAZON_BUSINESS']);

export const moneySchema = z.number().nonnegative();

export const campaignSchema = z.object({
    campaignId: z.string(),
    name: z.string(),
    state: stateSchema,
    budget: moneySchema,
    bidStrategy: bidStrategySchema.nullable().optional(),
    startDateTime: z.string().nullable().optional(),
    endDateTime: z.string().nullable().optional(),
    portfolioId: z.string().nullable().optional(),
    creationDateTime: z.string().nullable(),
    lastUpdatedDateTime: z.string().nullable(),
});

export const adGroupSchema = z.object({
    adGroupId: z.string(),
    campaignId: z.string(),
    name: z.string(),
    defaultBid: moneySchema,
    state: stateSchema,
});

export const adSchema = z.object({
    adId: z.string(),
    campaignId: z.string(),
    adGroupId: z.string(),
    state: stateSchema,
    productIdType: productIdTypeSchema,
    productId: z.string(),
});

export const targetSchema = z.object({
    targetId: z.string(),
    campaignId: z.string(),
    adGroupId: z.string().nullable(),
    state: stateSchema,
    bid: moneySchema.nullable(),
    type: z.enum(['KEYWORD', 'PRODUCT']),
    keyword: z.string().nullable().optional(),
    keywordMatchType: keywordMatchTypeSchema.nullable().optional(),
    productIdType: productIdTypeSchema.nullable().optional(),
    productId: z.string().nullable().optional(),
    productMatchType: productMatchTypeSchema.nullable().optional(),
});

export const metricsKeySchema = z.enum(['impressions', 'clicks', 'spend', 'purchases', 'sales', 'acos', 'cpc', 'ctr', 'roas']);

export const metricsBucketSchema = z.enum(['auto', 'hour', 'day', 'week', 'month', 'year']);
export const metricsGranularitySchema = z.enum(['hour', 'day', 'week', 'month', 'year']);

export const metricsValueSchema = z.record(metricsKeySchema, z.number().nullable());

export const metricsTotalsSchema = metricsValueSchema;

export const metricsPointSchema = z.object({
    start: z.string(),
    end: z.string(),
    metrics: metricsValueSchema,
});

export const metricsSeriesRangeSchema = z.object({
    startDate: z.string(),
    endDate: z.string(),
});

export const metricsSeriesOutputSchema = z.object({
    totals: metricsTotalsSchema,
    series: z.array(metricsPointSchema),
    granularity: metricsGranularitySchema,
    timezone: z.string(),
    range: metricsSeriesRangeSchema,
});

export const accountsListOutputSchema = z.object({
    items: z.array(
        z.object({
            accountId: z.string(),
            name: z.string().nullable(),
            countryCode: z.string().nullable(),
        })
    ),
});

export const campaignsListOutputSchema = z.object({
    items: z.array(campaignSchema),
});

export const campaignsGetOutputSchema = z.object({
    item: campaignSchema,
});

export const campaignsCreateInputSchema = publicConfigInputSchema.extend({
    name: z.string(),
    budget: moneySchema,
});

export const campaignsUpdateInputSchema = publicConfigInputSchema.extend({
    campaignId: z.string(),
    name: z.string().optional(),
    portfolioId: z.string().nullable().optional(),
    startDateTime: z.string().optional(),
    endDateTime: z.string().nullable().optional(),
});

export const campaignsStateInputSchema = publicConfigInputSchema.extend({
    campaignId: z.string(),
});

export const campaignsDeleteInputSchema = publicConfigInputSchema.extend({
    campaignId: z.string(),
});

export const campaignsSetBudgetInputSchema = publicConfigInputSchema.extend({
    campaignId: z.string(),
    budget: moneySchema,
});

export const campaignsSetBidStrategyInputSchema = publicConfigInputSchema.extend({
    campaignId: z.string(),
    strategy: bidStrategySchema,
});

export const campaignsSetBidAdjustmentsInputSchema = publicConfigInputSchema.extend({
    campaignId: z.string(),
    scope: z.enum(['placement', 'audience', 'creative']),
    adjustments: z.any(),
});

export const adGroupsListOutputSchema = z.object({
    items: z.array(adGroupSchema),
});

export const adGroupsGetOutputSchema = z.object({
    item: adGroupSchema,
});

export const adGroupsCreateInputSchema = publicConfigInputSchema.extend({
    campaignId: z.string(),
    name: z.string(),
    defaultBid: moneySchema,
});

export const adGroupsUpdateInputSchema = publicConfigInputSchema.extend({
    adGroupId: z.string(),
    name: z.string(),
});

export const adGroupsSetDefaultBidInputSchema = publicConfigInputSchema.extend({
    adGroupId: z.string(),
    value: moneySchema,
});

export const adGroupsStateInputSchema = publicConfigInputSchema.extend({
    adGroupId: z.string(),
});

export const adGroupsDeleteInputSchema = publicConfigInputSchema.extend({
    adGroupId: z.string(),
});

export const adsListOutputSchema = z.object({
    items: z.array(adSchema),
});

export const adsGetOutputSchema = z.object({
    item: adSchema,
});

export const adsCreateInputSchema = publicConfigInputSchema.extend({
    adGroupId: z.string(),
    productIdType: productIdTypeSchema,
    productId: z.string(),
});

export const adsUpdateInputSchema = publicConfigInputSchema.extend({
    adId: z.string(),
    state: stateSchema,
});

export const adsDeleteInputSchema = publicConfigInputSchema.extend({
    adId: z.string(),
});

export const asinsGetInputSchema = publicConfigInputSchema.extend({
    asin: z.string().trim().min(1),
});

export const asinTreeAdGroupSchema = adGroupSchema.extend({
    targets: z.array(targetSchema),
    ads: z.array(adSchema),
});

export const asinTreeCampaignSchema = z.object({
    campaignId: z.string(),
    campaignName: z.string(),
    state: stateSchema,
    creationDateTime: z.string().nullable(),
    targets: z.array(targetSchema),
    adGroups: z.array(asinTreeAdGroupSchema),
});

export const asinsGetOutputSchema = z.object({
    campaigns: z.array(asinTreeCampaignSchema),
});

export const targetsListOutputSchema = z.object({
    items: z.array(targetSchema),
});

export const targetsGetOutputSchema = z.object({
    item: targetSchema,
});

export const targetsCreateKeywordInputSchema = publicConfigInputSchema.extend({
    adGroupId: z.string(),
    keyword: z.string(),
    matchType: keywordMatchTypeSchema,
    bid: moneySchema,
});

export const targetsCreateProductInputSchema = publicConfigInputSchema.extend({
    adGroupId: z.string(),
    productIdType: productIdTypeSchema,
    productId: z.string(),
    matchType: productMatchTypeSchema,
    bid: moneySchema,
});

export const targetsDeleteInputSchema = publicConfigInputSchema.extend({
    targetId: z.string(),
});

export const targetsStateInputSchema = publicConfigInputSchema.extend({
    targetId: z.string(),
});

export const bidsSetInputSchema = publicConfigInputSchema.extend({
    targetId: z.string(),
    value: moneySchema,
});

export const bidsAdjustInputSchema = publicConfigInputSchema.extend({
    targetId: z.string(),
    delta: z.number(),
});

export const metricsRangeSchema = z.object({
    min: z.number().optional(),
    max: z.number().optional(),
});

export const metricsRangeFiltersSchema = z.record(metricsKeySchema, metricsRangeSchema).optional();

export const metricsFiltersSchema = z
    .object({
        search: z.string().optional(),
        state: listStateSchema.optional(),
        targeting: z.enum(['AUTO', 'MANUAL']).optional(),
        targetType: z.enum(['KEYWORD', 'PRODUCT']).optional(),
        targetMatchType: z.union([keywordMatchTypeSchema, productMatchTypeSchema]).optional(),
        budget: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
        endDate: z.object({ before: z.string().optional(), after: z.string().optional() }).optional(),
        outOfBudget: z.boolean().optional(),
        metrics: metricsRangeFiltersSchema,
    })
    .optional();

export const metricsSelectionSchema = z.array(metricsKeySchema).optional();

export const metricsSeriesInputSchema = publicConfigInputSchema.extend({
    campaignId: z.string().optional(),
    adGroupId: z.string().optional(),
    ids: z.array(z.string()).optional(),
    metrics: metricsSelectionSchema,
    filters: metricsFiltersSchema,
    range: z.string().optional(),
    bucket: metricsBucketSchema.optional(),
});

export const metricsTableSortFieldSchema = z.enum(['impressions', 'clicks', 'purchases', 'spend', 'sales', 'acos', 'cpc', 'ctr', 'roas']);

export const metricsTableSortSchema = z.object({
    field: metricsTableSortFieldSchema,
    direction: z.enum(['asc', 'desc']),
});

export const metricsTableInputSchema = publicConfigInputSchema.extend({
    campaignId: z.string().optional(),
    adGroupId: z.string().optional(),
    ids: z.array(z.string()).optional(),
    metrics: metricsSelectionSchema,
    filters: metricsFiltersSchema,
    sort: metricsTableSortSchema.optional(),
    limit: z.number().min(1).max(200).optional(),
    offset: z.number().min(0).optional(),
    range: z.string().optional(),
});

export const metricsTableCampaignItemSchema = z.object({
    campaignId: z.string(),
    name: z.string().nullable(),
    state: stateSchema.nullable(),
    metrics: metricsTotalsSchema,
});

export const metricsTableAdGroupItemSchema = z.object({
    adGroupId: z.string(),
    campaignId: z.string(),
    campaignName: z.string().nullable(),
    name: z.string().nullable(),
    state: stateSchema.nullable(),
    metrics: metricsTotalsSchema,
});

export const metricsTableAdItemSchema = z.object({
    adId: z.string(),
    campaignId: z.string(),
    campaignName: z.string().nullable(),
    adGroupId: z.string(),
    adGroupName: z.string().nullable(),
    state: stateSchema.nullable(),
    productId: z.string().nullable(),
    metrics: metricsTotalsSchema,
});

export const metricsTableTargetItemSchema = z.object({
    targetId: z.string(),
    campaignId: z.string(),
    campaignName: z.string().nullable(),
    adGroupId: z.string().nullable(),
    adGroupName: z.string().nullable(),
    state: stateSchema.nullable(),
    type: z.enum(['KEYWORD', 'PRODUCT']),
    keyword: z.string().nullable(),
    keywordMatchType: keywordMatchTypeSchema.nullable(),
    productId: z.string().nullable(),
    productMatchType: productMatchTypeSchema.nullable(),
    metrics: metricsTotalsSchema,
});

export const metricsTableCampaignsOutputSchema = z.object({
    totals: metricsTotalsSchema,
    items: z.array(metricsTableCampaignItemSchema),
    sort: metricsTableSortSchema,
});

export const metricsTableAdGroupsOutputSchema = z.object({
    totals: metricsTotalsSchema,
    items: z.array(metricsTableAdGroupItemSchema),
    sort: metricsTableSortSchema,
});

export const metricsTableAdsOutputSchema = z.object({
    totals: metricsTotalsSchema,
    items: z.array(metricsTableAdItemSchema),
    sort: metricsTableSortSchema,
});

export const metricsTableTargetsOutputSchema = z.object({
    totals: metricsTotalsSchema,
    items: z.array(metricsTableTargetItemSchema),
    sort: metricsTableSortSchema,
});

export const enumsBidStrategyOutputSchema = z.object({
    items: z.array(bidStrategySchema),
});

export const enumsMatchTypeOutputSchema = z.object({
    keyword: z.array(keywordMatchTypeSchema),
    product: z.array(productMatchTypeSchema),
});

export const enumsPlacementOutputSchema = z.object({
    items: z.array(placementSchema),
});

export const enumsStateOutputSchema = z.object({
    items: z.array(stateSchema),
});
