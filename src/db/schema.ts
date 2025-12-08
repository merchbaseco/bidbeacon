import {
    bigint,
    boolean,
    doublePrecision,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';

// Campaigns dataset - Based on official AMS Campaign Management Campaign dataset schema
export const ams_cm_campaigns = pgTable(
    'ams_cm_campaigns',
    {
        datasetId: text('dataset_id').notNull(),
        campaignId: text('campaign_id').notNull(),
        portfolioId: text('portfolio_id'),
        adProduct: text('ad_product').notNull(),
        marketplaceScope: text('marketplace_scope'), // enum: GLOBAL vs SINGLE_MARKETPLACE
        marketplaces: jsonb('marketplaces'), // enum[] - Array of marketplace strings
        name: text('name').notNull(),
        skanAppId: text('skan_app_id'),
        startDateTime: timestamp('start_date_time', { withTimezone: true, mode: 'date' }),
        endDateTime: timestamp('end_date_time', { withTimezone: true, mode: 'date' }),
        creationDateTime: timestamp('creation_date_time', { withTimezone: true, mode: 'date' }),
        lastUpdatedDateTime: timestamp('last_updated_date_time', {
            withTimezone: true,
            mode: 'date',
        }),
        targetsAmazonDeal: boolean('targets_amazon_deal'),
        brandId: text('brand_id'), // 16 chars
        costType: text('cost_type'), // enum: CPC / vCPM
        salesChannel: text('sales_channel'), // enum: AMAZON / OFF_AMAZON
        isMultiAdGroupsEnabled: boolean('is_multi_ad_groups_enabled'),
        purchaseOrderNumber: text('purchase_order_number'),
        // Nested objects stored as jsonb
        state: jsonb('state'), // { state: enum, marketplace_settings: [...] }
        status: jsonb('status'), // { delivery_status: enum, delivery_reasons: [], marketplace_settings: [...] }
        tags: jsonb('tags'), // Array of { key: string, value: string }
        budgets: jsonb('budgets'), // Mixed structure - all budget caps and marketplace budget settings
        frequencies: jsonb('frequencies'), // Mixed structure - frequency capping settings
        autoCreationSettings: jsonb('auto_creation_settings'), // { auto_create_targets: boolean }
        optimizations: jsonb('optimizations'), // Mixed structure - bid strategies, goals, budget allocation
        fee: jsonb('fee'), // Mixed structure - third-party fee metadata
        flights: jsonb('flights'), // Mixed structure - flight scheduling and budgets
    },
    table => ({
        amsCmCampaignsUniqueIndex: uniqueIndex('ams_cm_campaigns_campaign_id_idx').on(
            table.campaignId
        ),
    })
);

// AdGroups dataset - Based on official AMS Campaign Management AdGroup dataset schema
export const ams_cm_adgroups = pgTable(
    'ams_cm_adgroups',
    {
        datasetId: text('dataset_id').notNull(),
        adGroupId: text('ad_group_id').notNull(),
        campaignId: text('campaign_id').notNull(),
        adProduct: text('ad_product').notNull(),
        marketplaceScope: text('marketplace_scope'), // enum: Global/single marketplace
        marketplaces: jsonb('marketplaces'), // enum[] - Array of marketplace strings
        name: text('name').notNull(),
        creationDateTime: timestamp('creation_date_time', { withTimezone: true, mode: 'date' }),
        lastUpdatedDateTime: timestamp('last_updated_date_time', {
            withTimezone: true,
            mode: 'date',
        }),
        startDateTime: timestamp('start_date_time', { withTimezone: true, mode: 'date' }),
        endDateTime: timestamp('end_date_time', { withTimezone: true, mode: 'date' }),
        inventoryType: text('inventory_type'), // enum: What inventory this ad group can appear on
        creativeRotationType: text('creative_rotation_type'), // enum: RANDOM / WEIGHTED
        purchaseOrderNumber: text('purchase_order_number'),
        advertisedProductCategoryIds: jsonb('advertised_product_category_ids'), // string[] - Product category IDs
        // Nested objects stored as jsonb
        state: jsonb('state'), // { state: enum, marketplace_settings: {...} }
        status: jsonb('status'), // Delivery info - enum
        bid: jsonb('bid'), // { bid: { default_bid, base_bid, currency_code, max_average_bid }, marketplace_settings: {...} }
        optimization: jsonb('optimization'), // { bid_strategy: enum, budget_settings: {...} }
        budgets: jsonb('budgets'), // Budget caps and marketplace budget settings
        pacing: jsonb('pacing'), // Delivery pacing
        frequencies: jsonb('frequencies'), // Frequency caps
        targetingSettings: jsonb('targeting_settings'), // Language, viewability, audience, etc.
        tags: jsonb('tags'), // Array of { key: string, value: string }
        fees: jsonb('fees'), // Fee metadata
    },
    table => ({
        amsCmAdgroupsUniqueIndex: uniqueIndex('ams_cm_adgroups_ad_group_id_campaign_id_idx').on(
            table.adGroupId,
            table.campaignId
        ),
    })
);

// Ads dataset - Based on official AMS Campaign Management Ad dataset schema
export const ams_cm_ads = pgTable(
    'ams_cm_ads',
    {
        datasetId: text('dataset_id').notNull(),
        adId: text('ad_id').notNull(),
        adGroupId: text('ad_group_id'), // Optional - may be missing due to AMS data quality issues
        campaignId: text('campaign_id'), // Optional - may be missing due to AMS data quality issues
        adProduct: text('ad_product').notNull(), // enum: SP / SB / DSP
        marketplaceScope: text('marketplace_scope'), // enum: Global/single marketplace
        marketplaces: jsonb('marketplaces'), // enum[] - Array of marketplace strings
        name: text('name').notNull(),
        creationDateTime: timestamp('creation_date_time', { withTimezone: true, mode: 'date' }),
        lastUpdatedDateTime: timestamp('last_updated_date_time', {
            withTimezone: true,
            mode: 'date',
        }),
        adType: text('ad_type'), // enum: VIDEO / COMPONENT / PRODUCT_AD
        // Nested objects stored as jsonb
        state: jsonb('state'), // { state: enum, marketplace_settings: {...} }
        status: jsonb('status'), // { delivery_status: enum, delivery_reasons: enum[], marketplace_settings: {...} }
        creative: jsonb('creative'), // { product_creative: {...} } - Advertised product + headline + store settings
        tags: jsonb('tags'), // Array of { key: string, value: string }
    },
    table => ({
        amsCmAdsUniqueIndex: uniqueIndex('ams_cm_ads_ad_id_idx').on(table.adId),
    })
);

// Targets dataset - Based on official AMS Campaign Management Target dataset schema
export const ams_cm_targets = pgTable(
    'ams_cm_targets',
    {
        datasetId: text('dataset_id').notNull(),
        targetId: text('target_id').notNull(),
        adGroupId: text('ad_group_id').notNull(),
        campaignId: text('campaign_id').notNull(),
        adProduct: text('ad_product').notNull(), // enum: Ad product
        marketplaceScope: text('marketplace_scope'), // enum: Global/single marketplace
        marketplaces: jsonb('marketplaces'), // enum[] - Array of marketplace strings
        negative: boolean('negative'), // Is negative target
        targetLevel: text('target_level'), // enum: CAMPAIGN / AD_GROUP
        creationDateTime: timestamp('creation_date_time', { withTimezone: true, mode: 'date' }),
        lastUpdatedDateTime: timestamp('last_updated_date_time', {
            withTimezone: true,
            mode: 'date',
        }),
        targetType: text('target_type'), // enum: Massive list of target types
        // Nested objects stored as jsonb
        state: jsonb('state'), // { state: enum, marketplace_settings: {...} }
        status: jsonb('status'), // Delivery info - enum
        bid: jsonb('bid'), // { bid: { bid: double, currency_code: enum }, marketplace_settings: {...} }
        targetDetails: jsonb('target_details'), // { keyword_target: { match_type: enum, keyword: {...}, native_language_locale: enum } }
        tags: jsonb('tags'), // Array of { key: string, value: string }
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

// Worker control table - stores whether the queue processor is enabled
// This table should only ever have one row (id = 'main')
export const worker_control = pgTable('worker_control', {
    id: text('id').primaryKey().default('main'),
    enabled: boolean('enabled').notNull().default(true),
    messagesPerSecond: bigint('messages_per_second', { mode: 'number' }).notNull().default(0), // max messages per second (0 = unlimited)
    updatedAt: timestamp('updated_at', {
        withTimezone: true,
        mode: 'date',
    })
        .notNull()
        .defaultNow(),
});
