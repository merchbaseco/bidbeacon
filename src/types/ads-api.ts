import { z } from 'zod';

const paginationSchema = z.object({
    limit: z.number().int().min(1).max(200).optional(),
    cursor: z.string().optional(),
});

const sortDirectionSchema = z.enum(['asc', 'desc']);

const campaignSortFieldSchema = z.enum(['lastUpdatedDateTime', 'name', 'startDate', 'budgetAmount', 'state']);
const adGroupSortFieldSchema = z.enum(['lastUpdatedDateTime', 'name', 'bidAmount', 'state']);
const adSortFieldSchema = z.enum(['lastUpdatedDateTime', 'adId', 'state']);
const targetSortFieldSchema = z.enum(['lastUpdatedDateTime', 'bidAmount', 'state', 'targetType']);

const campaignFiltersSchema = z.object({
    search: z.string().optional(),
    state: z.string().optional(),
    adProduct: z.string().optional(),
});

const adGroupFiltersSchema = z.object({
    search: z.string().optional(),
    state: z.string().optional(),
    adProduct: z.string().optional(),
    campaignId: z.string().optional(),
});

const adFiltersSchema = z.object({
    search: z.string().optional(),
    state: z.string().optional(),
    adProduct: z.string().optional(),
    campaignId: z.string().optional(),
    adGroupId: z.string().optional(),
    productAsin: z.string().optional(),
});

const targetFiltersSchema = z.object({
    search: z.string().optional(),
    state: z.string().optional(),
    adProduct: z.string().optional(),
    campaignId: z.string().optional(),
    adGroupId: z.string().optional(),
    negative: z.boolean().optional(),
    targetType: z.string().optional(),
    targetMatchType: z.string().optional(),
});

export const campaignListInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string().optional(),
    pagination: paginationSchema.optional(),
    filters: campaignFiltersSchema.optional(),
    sort: z
        .object({
            field: campaignSortFieldSchema,
            direction: sortDirectionSchema.optional(),
        })
        .optional(),
});

export const adGroupListInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string().optional(),
    pagination: paginationSchema.optional(),
    filters: adGroupFiltersSchema.optional(),
    sort: z
        .object({
            field: adGroupSortFieldSchema,
            direction: sortDirectionSchema.optional(),
        })
        .optional(),
});

export const adListInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string().optional(),
    pagination: paginationSchema.optional(),
    filters: adFiltersSchema.optional(),
    sort: z
        .object({
            field: adSortFieldSchema,
            direction: sortDirectionSchema.optional(),
        })
        .optional(),
});

export const targetListInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string().optional(),
    pagination: paginationSchema.optional(),
    filters: targetFiltersSchema.optional(),
    sort: z
        .object({
            field: targetSortFieldSchema,
            direction: sortDirectionSchema.optional(),
        })
        .optional(),
});

export const campaignDetailInputSchema = z.object({
    accountId: z.string(),
    campaignId: z.string(),
});

export const adGroupDetailInputSchema = z.object({
    accountId: z.string(),
    adGroupId: z.string(),
});

export const adDetailInputSchema = z.object({
    accountId: z.string(),
    adId: z.string(),
});

export const targetDetailInputSchema = z.object({
    accountId: z.string(),
    targetId: z.string(),
});

const campaignRowSchema = z.object({
    campaignId: z.string(),
    accountId: z.string(),
    countryCode: z.string().nullable(),
    name: z.string(),
    adProduct: z.string(),
    state: z.string(),
    deliveryStatus: z.string(),
    targetingSettings: z.string(),
    bidStrategy: z.string().nullable(),
    budgetType: z.string().nullable(),
    budgetPeriod: z.string().nullable(),
    budgetAmount: z.number().nullable(),
    startDate: z.string(),
    endDate: z.string().nullable(),
    creationDateTime: z.string(),
    lastUpdatedDateTime: z.string(),
});

const adGroupRowSchema = z.object({
    adGroupId: z.string(),
    campaignId: z.string(),
    accountId: z.string(),
    countryCode: z.string().nullable(),
    name: z.string(),
    adProduct: z.string(),
    state: z.string(),
    deliveryStatus: z.string(),
    bidAmount: z.number().nullable(),
    creationDateTime: z.string(),
    lastUpdatedDateTime: z.string(),
});

const adRowSchema = z.object({
    adId: z.string(),
    campaignId: z.string(),
    adGroupId: z.string(),
    accountId: z.string(),
    countryCode: z.string().nullable(),
    adProduct: z.string(),
    adType: z.string(),
    state: z.string(),
    deliveryStatus: z.string(),
    productAsin: z.string().nullable(),
    creationDateTime: z.string(),
    lastUpdatedDateTime: z.string(),
});

const targetRowSchema = z.object({
    targetId: z.string(),
    campaignId: z.string(),
    adGroupId: z.string().nullable(),
    accountId: z.string(),
    countryCode: z.string().nullable(),
    adProduct: z.string(),
    state: z.string(),
    deliveryStatus: z.string(),
    negative: z.boolean(),
    bidAmount: z.number().nullable(),
    targetType: z.string(),
    targetMatchType: z.string().nullable(),
    targetKeyword: z.string().nullable(),
    targetAsin: z.string().nullable(),
    targetDisplay: z.string(),
    creationDateTime: z.string(),
    lastUpdatedDateTime: z.string(),
});

const targetBidChangeSchema = z.object({
    lastBidChangeAt: z.string().nullable(),
    previousBid: z.number().nullable(),
    newBid: z.number().nullable(),
});

export const campaignListOutputSchema = z.object({
    rows: z.array(campaignRowSchema),
    nextCursor: z.string().nullable(),
});

export const adGroupListOutputSchema = z.object({
    rows: z.array(adGroupRowSchema),
    nextCursor: z.string().nullable(),
});

export const adListOutputSchema = z.object({
    rows: z.array(adRowSchema),
    nextCursor: z.string().nullable(),
});

export const targetListOutputSchema = z.object({
    rows: z.array(targetRowSchema),
    nextCursor: z.string().nullable(),
});

export const campaignDetailOutputSchema = campaignRowSchema;
export const adGroupDetailOutputSchema = adGroupRowSchema;
export const adDetailOutputSchema = adRowSchema;
export const targetDetailOutputSchema = targetRowSchema.extend(targetBidChangeSchema.shape);

const bidAmountSchema = z
    .number()
    .positive()
    .refine(value => Number.isFinite(value), { message: 'bidAmount must be a finite number.' })
    .refine(value => Number(value.toFixed(2)) === value, { message: 'bidAmount must have at most 2 decimal places.' });

export const updateAdGroupBidInputSchema = z.object({
    accountId: z.string(),
    adGroupId: z.string(),
    bidAmount: bidAmountSchema,
});

export const updateTargetBidInputSchema = z.object({
    accountId: z.string(),
    targetId: z.string(),
    bidAmount: bidAmountSchema,
});

export const updateAdGroupBidOutputSchema = z.object({
    adGroupId: z.string(),
    bidAmount: z.number(),
    lastUpdatedDateTime: z.string(),
});

export const updateTargetBidOutputSchema = z.object({
    targetId: z.string(),
    bidAmount: z.number(),
    lastUpdatedDateTime: z.string(),
});

export type CampaignListInput = z.infer<typeof campaignListInputSchema>;
export type AdGroupListInput = z.infer<typeof adGroupListInputSchema>;
export type AdListInput = z.infer<typeof adListInputSchema>;
export type TargetListInput = z.infer<typeof targetListInputSchema>;
export type CampaignListOutput = z.infer<typeof campaignListOutputSchema>;
export type AdGroupListOutput = z.infer<typeof adGroupListOutputSchema>;
export type AdListOutput = z.infer<typeof adListOutputSchema>;
export type TargetListOutput = z.infer<typeof targetListOutputSchema>;
export type UpdateAdGroupBidInput = z.infer<typeof updateAdGroupBidInputSchema>;
export type UpdateTargetBidInput = z.infer<typeof updateTargetBidInputSchema>;
export type UpdateAdGroupBidOutput = z.infer<typeof updateAdGroupBidOutputSchema>;
export type UpdateTargetBidOutput = z.infer<typeof updateTargetBidOutputSchema>;
