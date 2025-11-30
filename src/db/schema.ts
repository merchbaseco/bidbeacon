import {
    bigint,
    doublePrecision,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';

// Campaigns dataset
export const ams_cm_campaigns = pgTable(
    'ams_cm_campaigns',
    {
        datasetId: text('dataset_id').notNull(),
        advertiserId: text('advertiser_id').notNull(),
        marketplaceId: text('marketplace_id').notNull(),
        campaignId: text('campaign_id').notNull(),
        accountId: text('account_id').notNull(),
        portfolioId: text('portfolio_id'),
        adProduct: text('ad_product').notNull(),
        productLocation: text('product_location'),
        version: bigint('version', { mode: 'number' }).notNull(),
        name: text('name').notNull(),
        startDateTime: timestamp('start_date_time', { withTimezone: true, mode: 'date' }),
        endDateTime: timestamp('end_date_time', { withTimezone: true, mode: 'date' }),
        state: text('state'),
        tags: jsonb('tags'),
        targetingSettings: text('targeting_settings'),
        budgetBudgetCapMonetaryBudgetAmount: doublePrecision(
            'budget_budget_cap_monetary_budget_amount'
        ),
        budgetBudgetCapMonetaryBudgetCurrencyCode: text(
            'budget_budget_cap_monetary_budget_currency_code'
        ),
        budgetBudgetCapRecurrenceRecurrenceType: text(
            'budget_budget_cap_recurrence_recurrence_type'
        ),
        bidSettingBidStrategy: text('bid_setting_bid_strategy'),
        bidSettingPlacementBidAdjustment: jsonb('bid_setting_placement_bid_adjustment'),
        bidSettingShopperCohortBidAdjustment: jsonb('bid_setting_shopper_cohort_bid_adjustment'),
        auditCreationDateTime: timestamp('audit_creation_date_time', {
            withTimezone: true,
            mode: 'date',
        }),
        auditLastUpdatedDateTime: timestamp('audit_last_updated_date_time', {
            withTimezone: true,
            mode: 'date',
        }),
    },
    table => ({
        amsCmCampaignsUniqueIndex: uniqueIndex('ams_cm_campaigns_campaign_id_version_idx').on(
            table.campaignId,
            table.version
        ),
    })
);

// AdGroups dataset
export const ams_cm_adgroups = pgTable(
    'ams_cm_adgroups',
    {
        adGroupId: text('ad_group_id').notNull(),
        campaignId: text('campaign_id').notNull(),
        adProduct: text('ad_product').notNull(),
        name: text('name').notNull(),
        state: text('state').notNull(),
        deliveryStatus: text('delivery_status'),
        deliveryReasons: jsonb('delivery_reasons'),
        creativeType: text('creative_type'),
        creationDateTime: timestamp('creation_date_time', { withTimezone: true, mode: 'date' }),
        lastUpdatedDateTime: timestamp('last_updated_date_time', {
            withTimezone: true,
            mode: 'date',
        }),
        bidDefaultBid: doublePrecision('bid_default_bid'),
        bidCurrencyCode: text('bid_currency_code'),
        optimizationGoalSettingGoal: text('optimization_goal_setting_goal'),
        optimizationGoalSettingKpi: text('optimization_goal_setting_kpi'),
    },
    table => ({
        amsCmAdgroupsUniqueIndex: uniqueIndex('ams_cm_adgroups_ad_group_id_campaign_id_idx').on(
            table.adGroupId,
            table.campaignId
        ),
    })
);

// Ads dataset
export const ams_cm_ads = pgTable(
    'ams_cm_ads',
    {
        adId: text('ad_id').notNull(),
        adGroupId: text('ad_group_id'),
        campaignId: text('campaign_id'),
        adProduct: text('ad_product'),
        name: text('name'),
        state: text('state'),
        deliveryStatus: text('delivery_status'),
        deliveryReasons: jsonb('delivery_reasons'),
        creativeType: text('creative_type'),
        creationDateTime: timestamp('creation_date_time', { withTimezone: true, mode: 'date' }),
        lastUpdatedDateTime: timestamp('last_updated_date_time', {
            withTimezone: true,
            mode: 'date',
        }),
        servingStatus: text('serving_status'),
        servingReasons: jsonb('serving_reasons'),
    },
    table => ({
        amsCmAdsUniqueIndex: uniqueIndex('ams_cm_ads_ad_id_idx').on(table.adId),
    })
);

// Targets dataset
export const ams_cm_targets = pgTable(
    'ams_cm_targets',
    {
        targetId: text('target_id').notNull(),
        adGroupId: text('ad_group_id'),
        campaignId: text('campaign_id'),
        adProduct: text('ad_product'),
        expressionType: text('expression_type'),
        expression: jsonb('expression'),
        state: text('state'),
        startDateTime: timestamp('start_date_time', { withTimezone: true, mode: 'date' }),
        endDateTime: timestamp('end_date_time', { withTimezone: true, mode: 'date' }),
        creationDateTime: timestamp('creation_date_time', { withTimezone: true, mode: 'date' }),
        lastUpdatedDateTime: timestamp('last_updated_date_time', {
            withTimezone: true,
            mode: 'date',
        }),
    },
    table => ({
        amsCmTargetsUniqueIndex: uniqueIndex('ams_cm_targets_target_id_idx').on(table.targetId),
    })
);

// Sponsored Products traffic dataset
export const ams_sp_traffic = pgTable(
    'ams_sp_traffic',
    {
        idempotencyId: text('idempotency_id').notNull(),
        datasetId: text('dataset_id').notNull(),
        marketplaceId: text('marketplace_id').notNull(),
        currency: text('currency').notNull(),
        advertiserId: text('advertiser_id').notNull(),
        campaignId: text('campaign_id').notNull(),
        adGroupId: text('ad_group_id').notNull(),
        adId: text('ad_id').notNull(),
        keywordId: text('keyword_id').notNull(),
        keywordText: text('keyword_text').notNull(),
        matchType: text('match_type').notNull(),
        placement: text('placement').notNull(),
        timeWindowStart: timestamp('time_window_start', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        clicks: bigint('clicks', { mode: 'number' }).notNull(),
        impressions: bigint('impressions', { mode: 'number' }).notNull(),
        cost: doublePrecision('cost').notNull(),
    },
    table => ({
        amsSpTrafficUniqueIndex: uniqueIndex('ams_sp_traffic_idempotency_id_idx').on(
            table.idempotencyId
        ),
    })
);

// Sponsored Products conversions dataset
export const ams_sp_conversion = pgTable(
    'ams_sp_conversion',
    {
        idempotencyId: text('idempotency_id').notNull(),
        datasetId: text('dataset_id').notNull(),
        marketplaceId: text('marketplace_id').notNull(),
        currency: text('currency').notNull(),
        advertiserId: text('advertiser_id').notNull(),
        campaignId: text('campaign_id').notNull(),
        adGroupId: text('ad_group_id').notNull(),
        adId: text('ad_id').notNull(),
        keywordId: text('keyword_id').notNull(),
        placement: text('placement').notNull(),
        timeWindowStart: timestamp('time_window_start', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        attributedConversions1d: bigint('attributed_conversions_1d', { mode: 'number' }),
        attributedConversions7d: bigint('attributed_conversions_7d', { mode: 'number' }),
        attributedConversions14d: bigint('attributed_conversions_14d', { mode: 'number' }),
        attributedConversions30d: bigint('attributed_conversions_30d', { mode: 'number' }),
        attributedConversions1dSameSku: bigint('attributed_conversions_1d_same_sku', {
            mode: 'number',
        }),
        attributedConversions7dSameSku: bigint('attributed_conversions_7d_same_sku', {
            mode: 'number',
        }),
        attributedConversions14dSameSku: bigint('attributed_conversions_14d_same_sku', {
            mode: 'number',
        }),
        attributedConversions30dSameSku: bigint('attributed_conversions_30d_same_sku', {
            mode: 'number',
        }),
        attributedSales1d: doublePrecision('attributed_sales_1d'),
        attributedSales7d: doublePrecision('attributed_sales_7d'),
        attributedSales14d: doublePrecision('attributed_sales_14d'),
        attributedSales30d: doublePrecision('attributed_sales_30d'),
        attributedSales1dSameSku: doublePrecision('attributed_sales_1d_same_sku'),
        attributedSales7dSameSku: doublePrecision('attributed_sales_7d_same_sku'),
        attributedSales14dSameSku: doublePrecision('attributed_sales_14d_same_sku'),
        attributedSales30dSameSku: doublePrecision('attributed_sales_30d_same_sku'),
        attributedUnitsOrdered1d: bigint('attributed_units_ordered_1d', { mode: 'number' }),
        attributedUnitsOrdered7d: bigint('attributed_units_ordered_7d', { mode: 'number' }),
        attributedUnitsOrdered14d: bigint('attributed_units_ordered_14d', { mode: 'number' }),
        attributedUnitsOrdered30d: bigint('attributed_units_ordered_30d', { mode: 'number' }),
        attributedUnitsOrdered1dSameSku: bigint('attributed_units_ordered_1d_same_sku', {
            mode: 'number',
        }),
        attributedUnitsOrdered7dSameSku: bigint('attributed_units_ordered_7d_same_sku', {
            mode: 'number',
        }),
        attributedUnitsOrdered14dSameSku: bigint('attributed_units_ordered_14d_same_sku', {
            mode: 'number',
        }),
        attributedUnitsOrdered30dSameSku: bigint('attributed_units_ordered_30d_same_sku', {
            mode: 'number',
        }),
    },
    table => ({
        amsSpConversionUniqueIndex: uniqueIndex('ams_sp_conversion_idempotency_id_idx').on(
            table.idempotencyId
        ),
    })
);

// Sponsored ads budget usage dataset
export const ams_budget_usage = pgTable(
    'ams_budget_usage',
    {
        advertiserId: text('advertiser_id').notNull(),
        marketplaceId: text('marketplace_id').notNull(),
        datasetId: text('dataset_id').notNull(),
        budgetScopeId: text('budget_scope_id').notNull(),
        budgetScopeType: text('budget_scope_type').notNull(),
        advertisingProductType: text('advertising_product_type').notNull(),
        budget: doublePrecision('budget').notNull(),
        budgetUsagePercentage: doublePrecision('budget_usage_percentage').notNull(),
        usageUpdatedTimestamp: timestamp('usage_updated_timestamp', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
    },
    table => ({
        amsBudgetUsageUniqueIndex: uniqueIndex(
            'ams_budget_usage_advertiser_marketplace_budget_scope_timestamp_idx'
        ).on(
            table.advertiserId,
            table.marketplaceId,
            table.budgetScopeId,
            table.usageUpdatedTimestamp
        ),
    })
);
