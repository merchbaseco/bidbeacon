import { z } from 'zod';

export const cliConfigSchema = z.object({
    accountId: z.string(),
    countryCode: z.string().optional(),
    range: z.string(),
});

export const cliConfigInputSchema = z.object({
    config: cliConfigSchema,
});

export const stateSchema = z.enum(['ENABLED', 'PAUSED', 'ARCHIVED']);
export const bidStrategySchema = z.enum(['MANUAL', 'RULE_BASED', 'SALES_DOWN_ONLY', 'SALES_UP_AND_DOWN']);
export const keywordMatchTypeSchema = z.enum(['BROAD', 'PHRASE', 'EXACT']);
export const productMatchTypeSchema = z.enum(['PRODUCT_EXACT', 'PRODUCT_SIMILAR']);
export const productIdTypeSchema = z.enum(['ASIN', 'SKU']);
export const placementSchema = z.enum(['TOP_OF_SEARCH', 'REST_OF_SEARCH', 'PRODUCT_PAGE', 'SITE_AMAZON_BUSINESS']);

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

export const metricsTotalsSchema = z.object({
    impressions: z.number(),
    clicks: z.number(),
    spend: z.number(),
    purchases: z.number(),
    sales: z.number(),
    acos: z.number().nullable(),
    cpc: z.number().nullable(),
    ctr: z.number().nullable(),
});

export const metricsPointSchema = z.object({
    start: z.string(),
    end: z.string(),
    impressions: z.number(),
    clicks: z.number(),
    spend: z.number(),
    purchases: z.number(),
    sales: z.number(),
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

export const campaignsCreateInputSchema = cliConfigInputSchema.extend({
    name: z.string(),
    budget: moneySchema,
});

export const campaignsUpdateInputSchema = cliConfigInputSchema.extend({
    campaignId: z.string(),
    name: z.string().optional(),
    portfolioId: z.string().nullable().optional(),
    startDateTime: z.string().optional(),
    endDateTime: z.string().nullable().optional(),
});

export const campaignsStateInputSchema = cliConfigInputSchema.extend({
    campaignId: z.string(),
});

export const campaignsDeleteInputSchema = cliConfigInputSchema.extend({
    campaignId: z.string(),
});

export const campaignsSetBudgetInputSchema = cliConfigInputSchema.extend({
    campaignId: z.string(),
    budget: moneySchema,
});

export const campaignsSetBidStrategyInputSchema = cliConfigInputSchema.extend({
    campaignId: z.string(),
    strategy: bidStrategySchema,
});

export const campaignsSetBidAdjustmentsInputSchema = cliConfigInputSchema.extend({
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

export const adGroupsCreateInputSchema = cliConfigInputSchema.extend({
    campaignId: z.string(),
    name: z.string(),
    defaultBid: moneySchema,
});

export const adGroupsUpdateInputSchema = cliConfigInputSchema.extend({
    adGroupId: z.string(),
    name: z.string(),
});

export const adGroupsSetDefaultBidInputSchema = cliConfigInputSchema.extend({
    adGroupId: z.string(),
    value: moneySchema,
});

export const adGroupsStateInputSchema = cliConfigInputSchema.extend({
    adGroupId: z.string(),
});

export const adGroupsDeleteInputSchema = cliConfigInputSchema.extend({
    adGroupId: z.string(),
});

export const adsListOutputSchema = z.object({
    items: z.array(adSchema),
});

export const adsGetOutputSchema = z.object({
    item: adSchema,
});

export const adsCreateInputSchema = cliConfigInputSchema.extend({
    adGroupId: z.string(),
    productIdType: productIdTypeSchema,
    productId: z.string(),
});

export const adsUpdateInputSchema = cliConfigInputSchema.extend({
    adId: z.string(),
    state: stateSchema,
});

export const adsDeleteInputSchema = cliConfigInputSchema.extend({
    adId: z.string(),
});

export const targetsListOutputSchema = z.object({
    items: z.array(targetSchema),
});

export const targetsGetOutputSchema = z.object({
    item: targetSchema,
});

export const targetsCreateKeywordInputSchema = cliConfigInputSchema.extend({
    adGroupId: z.string(),
    keyword: z.string(),
    matchType: keywordMatchTypeSchema,
    bid: moneySchema,
});

export const targetsCreateProductInputSchema = cliConfigInputSchema.extend({
    adGroupId: z.string(),
    productIdType: productIdTypeSchema,
    productId: z.string(),
    matchType: productMatchTypeSchema,
    bid: moneySchema,
});

export const targetsDeleteInputSchema = cliConfigInputSchema.extend({
    targetId: z.string(),
});

export const targetsStateInputSchema = cliConfigInputSchema.extend({
    targetId: z.string(),
});

export const bidsSetInputSchema = cliConfigInputSchema.extend({
    targetId: z.string(),
    value: moneySchema,
});

export const bidsAdjustInputSchema = cliConfigInputSchema.extend({
    targetId: z.string(),
    delta: z.number(),
});

export const metricsOutputSchema = z.object({
    totals: metricsTotalsSchema,
    series: z.array(metricsPointSchema),
});

export const metricsEntityInputSchema = cliConfigInputSchema.extend({
    entityId: z.string().optional(),
    entityType: z.enum(['campaign', 'adGroup', 'ad', 'target']),
});

export const metricsByIdInputSchema = cliConfigInputSchema.extend({
    id: z.string(),
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
