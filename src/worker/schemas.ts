import { z } from 'zod';

// SNS envelope schema for parsing SQS message bodies
export const snsEnvelopeSchema = z.object({
    Type: z.string(),
    MessageId: z.string().optional(),
    TopicArn: z.string().optional(),
    Message: z.string().optional(),
    Timestamp: z.string().optional(),
    SignatureVersion: z.string().optional(),
    Signature: z.string().optional(),
    SigningCertURL: z.string().optional(),
    UnsubscribeURL: z.string().optional(),
    SubscribeURL: z.string().optional(),
    Token: z.string().optional(),
});

// Base schema for AMS payloads - includes datasetId
const baseAmsPayloadSchema = z.object({
    datasetId: z.string(),
});

// Sponsored Products Traffic schema
export const spTrafficSchema = baseAmsPayloadSchema
    .extend({
        datasetId: z.string(),
        marketplaceId: z.string(),
        currency: z.string(),
        advertiserId: z.string(),
        campaignId: z.string(),
        adGroupId: z.string(),
        adId: z.string(),
        keywordId: z.string(),
        keywordText: z.string(),
        matchType: z.string(),
        placement: z.string(),
        timeWindowStart: z.string(), // ISO 8601 timestamp
        clicks: z.number().int().nonnegative(),
        impressions: z.number().int().nonnegative(),
        cost: z.number().nonnegative(),
        idempotencyId: z.string(),
    })
    .passthrough();

// Sponsored Products Conversion schema
export const spConversionSchema = baseAmsPayloadSchema
    .extend({
        datasetId: z.string(),
        marketplaceId: z.string(),
        currency: z.string(),
        advertiserId: z.string(),
        campaignId: z.string(),
        adGroupId: z.string(),
        adId: z.string(),
        keywordId: z.string(),
        placement: z.string(),
        timeWindowStart: z.string(), // ISO 8601 timestamp
        idempotencyId: z.string(),
        // All conversion fields are optional
        attributedConversions1d: z.number().int().nonnegative().optional(),
        attributedConversions7d: z.number().int().nonnegative().optional(),
        attributedConversions14d: z.number().int().nonnegative().optional(),
        attributedConversions30d: z.number().int().nonnegative().optional(),
        attributedConversions1dSameSku: z.number().int().nonnegative().optional(),
        attributedConversions7dSameSku: z.number().int().nonnegative().optional(),
        attributedConversions14dSameSku: z.number().int().nonnegative().optional(),
        attributedConversions30dSameSku: z.number().int().nonnegative().optional(),
        attributedSales1d: z.number().nonnegative().optional(),
        attributedSales7d: z.number().nonnegative().optional(),
        attributedSales14d: z.number().nonnegative().optional(),
        attributedSales30d: z.number().nonnegative().optional(),
        attributedSales1dSameSku: z.number().nonnegative().optional(),
        attributedSales7dSameSku: z.number().nonnegative().optional(),
        attributedSales14dSameSku: z.number().nonnegative().optional(),
        attributedSales30dSameSku: z.number().nonnegative().optional(),
        attributedUnitsOrdered1d: z.number().int().nonnegative().optional(),
        attributedUnitsOrdered7d: z.number().int().nonnegative().optional(),
        attributedUnitsOrdered14d: z.number().int().nonnegative().optional(),
        attributedUnitsOrdered30d: z.number().int().nonnegative().optional(),
        attributedUnitsOrdered1dSameSku: z.number().int().nonnegative().optional(),
        attributedUnitsOrdered7dSameSku: z.number().int().nonnegative().optional(),
        attributedUnitsOrdered14dSameSku: z.number().int().nonnegative().optional(),
        attributedUnitsOrdered30dSameSku: z.number().int().nonnegative().optional(),
    })
    .passthrough();

// Budget Usage schema
export const budgetUsageSchema = baseAmsPayloadSchema
    .extend({
        datasetId: z.string(),
        advertiserId: z.string(),
        marketplaceId: z.string(),
        budgetScopeId: z.string(),
        budgetScopeType: z.string(),
        advertisingProductType: z.string(),
        budget: z.number().nonnegative(),
        budgetUsagePercentage: z.number().min(0).max(100),
        usageUpdatedTimestamp: z.string(), // ISO 8601 timestamp
    })
    .passthrough();

// Campaign Management Campaign schema
export const campaignSchema = baseAmsPayloadSchema
    .extend({
        datasetId: z.string(),
        advertiserId: z.string(),
        marketplaceId: z.string(),
        campaignId: z.string(),
        accountId: z.string(),
        portfolioId: z.string().optional(),
        adProduct: z.string(),
        productLocation: z.string().optional(),
        version: z.number().int().positive(),
        name: z.string(),
        startDateTime: z.string().optional(), // ISO 8601 timestamp
        endDateTime: z.string().optional(), // ISO 8601 timestamp
        state: z.string().optional(),
        tags: z.record(z.unknown()).optional(),
        targetingSettings: z.string().optional(),
        budgetBudgetCapMonetaryBudgetAmount: z.number().nonnegative().optional(),
        budgetBudgetCapMonetaryBudgetCurrencyCode: z.string().optional(),
        budgetBudgetCapRecurrenceRecurrenceType: z.string().optional(),
        bidSettingBidStrategy: z.string().optional(),
        bidSettingPlacementBidAdjustment: z.record(z.unknown()).optional(),
        bidSettingShopperCohortBidAdjustment: z.record(z.unknown()).optional(),
        auditCreationDateTime: z.string().optional(), // ISO 8601 timestamp
        auditLastUpdatedDateTime: z.string().optional(), // ISO 8601 timestamp
    })
    .passthrough();

// Campaign Management AdGroup schema
export const adGroupSchema = baseAmsPayloadSchema
    .extend({
        adGroupId: z.string(),
        campaignId: z.string(),
        adProduct: z.string(),
        name: z.string(),
        state: z.string(),
        deliveryStatus: z.string().optional(),
        deliveryReasons: z.array(z.unknown()).optional(),
        creativeType: z.string().optional(),
        creationDateTime: z.string().optional(), // ISO 8601 timestamp
        lastUpdatedDateTime: z.string().optional(), // ISO 8601 timestamp
        bidDefaultBid: z.number().nonnegative().optional(),
        bidCurrencyCode: z.string().optional(),
        optimizationGoalSettingGoal: z.string().optional(),
        optimizationGoalSettingKpi: z.string().optional(),
    })
    .passthrough();

// Campaign Management Ad schema
export const adSchema = baseAmsPayloadSchema
    .extend({
        adId: z.string(),
        adGroupId: z.string().optional(),
        campaignId: z.string().optional(),
        adProduct: z.string().optional(),
        name: z.string().optional(),
        state: z.string().optional(),
        deliveryStatus: z.string().optional(),
        deliveryReasons: z.array(z.unknown()).optional(),
        creativeType: z.string().optional(),
        creationDateTime: z.string().optional(), // ISO 8601 timestamp
        lastUpdatedDateTime: z.string().optional(), // ISO 8601 timestamp
        servingStatus: z.string().optional(),
        servingReasons: z.array(z.unknown()).optional(),
    })
    .passthrough();

// Campaign Management Target schema
export const targetSchema = baseAmsPayloadSchema
    .extend({
        targetId: z.string(),
        adGroupId: z.string().optional(),
        campaignId: z.string().optional(),
        adProduct: z.string().optional(),
        expressionType: z.string().optional(),
        expression: z.record(z.unknown()).optional(),
        state: z.string().optional(),
        startDateTime: z.string().optional(), // ISO 8601 timestamp
        endDateTime: z.string().optional(), // ISO 8601 timestamp
        creationDateTime: z.string().optional(), // ISO 8601 timestamp
        lastUpdatedDateTime: z.string().optional(), // ISO 8601 timestamp
    })
    .passthrough();
