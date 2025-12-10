import {
    bigint,
    boolean,
    date,
    doublePrecision,
    index,
    integer,
    jsonb,
    numeric,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * ----------------------------------------------------------------------------
 * Ad Structure
 * ----------------------------------------------------------------------------
 */
export const campaign = pgTable(
    'campaign',
    {
        id: text('id').primaryKey(),
        campaignId: text('campaign_id').notNull(),
        portfolioId: text('portfolio_id'), // Optional
        name: text('name').notNull(),
        adProduct: text('ad_product').notNull(),
        state: text('state').notNull(),
        deliveryStatus: text('delivery_status').notNull(),
        startDate: date('start_date').notNull(),
        endDate: date('end_date'), // Optional - only some campaigns have this
        targetingSettings: text('targeting_settings').notNull(), // AUTO or MANUAL
        bidStrategy: text('bid_strategy'), // From optimization.bidStrategy
        budgetType: text('budget_type'), // From budgetCaps.budgetType
        budgetPeriod: text('budget_period'), // From budgetCaps.recurrenceTimePeriod
        budgetAmount: numeric('budget_amount', { precision: 6, scale: 2 }), // From budgetCaps.budgetValue.monetaryBudget.amount
        creationDateTime: timestamp('creation_date_time').notNull(),
        lastUpdatedDateTime: timestamp('last_updated_date_time').notNull(),
    },
    table => [uniqueIndex('campaign_campaign_id_idx').on(table.campaignId)]
);

export const adGroup = pgTable(
    'ad_group',
    {
        id: text('id').primaryKey(),
        adGroupId: text('ad_group_id').notNull(),
        campaignId: text('campaign_id').notNull(),
        name: text('name').notNull(),
        adProduct: text('ad_product').notNull(),
        state: text('state').notNull(),
        deliveryStatus: text('delivery_status').notNull(),
        bidAmount: numeric('bid_amount', { precision: 4, scale: 2 }), // From bid.defaultBid
        creationDateTime: timestamp('creation_date_time').notNull(),
        lastUpdatedDateTime: timestamp('last_updated_date_time').notNull(),
    },
    table => [
        uniqueIndex('ad_group_ad_group_id_idx').on(table.adGroupId),
        index('ad_group_campaign_id_idx').on(table.campaignId),
    ]
);

export const ad = pgTable(
    'ad',
    {
        id: text('id').primaryKey(),
        adId: text('ad_id').notNull(),
        adGroupId: text('ad_group_id').notNull(),
        campaignId: text('campaign_id').notNull(),
        adProduct: text('ad_product').notNull(),
        adType: text('ad_type').notNull(),
        state: text('state').notNull(),
        deliveryStatus: text('delivery_status').notNull(), // vvvv below is from creative.products[0] array.
        productAsin: text('product_asin'), // May need to support multiple ASINs in the future with a M:M...
        creationDateTime: timestamp('creation_date_time').notNull(), // but for now, since we only support SP,
        lastUpdatedDateTime: timestamp('last_updated_date_time').notNull(), // just take the first in the export.
    },
    table => [
        uniqueIndex('ad_ad_id_idx').on(table.adId),
        index('ad_ad_group_id_idx').on(table.adGroupId),
        index('ad_product_asin_idx').on(table.productAsin),
        index('ad_product_asin_state_idx').on(table.productAsin, table.state),
    ]
);

export const target = pgTable(
    'target',
    {
        id: text('id').primaryKey(),
        campaignId: text('campaign_id').notNull(),
        targetId: text('target_id').notNull(),
        adGroupId: text('ad_group_id'), // Campaign-level targets won't have an adGroupId.
        adProduct: text('ad_product').notNull(),
        state: text('state').notNull(),
        negative: boolean('negative').notNull(),
        bidAmount: numeric('bid_amount', { precision: 4, scale: 2 }),
        targetMatchType: text('target_details_match_type'),
        targetAsin: text('target_details_asin'),
        targetKeyword: text('target_details_keyword'),
        targetType: text('target_type').notNull(),
        deliveryStatus: text('delivery_status').notNull(),
        creationDateTime: timestamp('creation_date_time').notNull(),
        lastUpdatedDateTime: timestamp('last_updated_date_time').notNull(),
    },
    table => [
        uniqueIndex('target_target_id_idx').on(table.targetId),
        index('target_ad_group_id_idx').on(table.adGroupId),
    ]
);

/**
 * ----------------------------------------------------------------------------
 * Ad Performance
 * ----------------------------------------------------------------------------
 */
export const reportDatasetMetadata = pgTable(
    'report_dataset_metadata',
    {
        accountId: text('account_id').notNull(),
        timestamp: timestamp('timestamp', { withTimezone: false, mode: 'date' }).notNull(), // utc
        aggregation: text('aggregation').notNull(), // daily or hourly
        status: text('status').notNull(), // enum: missing, fetching, completed, failed
        lastRefreshed: timestamp('last_refreshed', { withTimezone: false, mode: 'date' }), // utc
        reportId: text('report_id').notNull(),
        error: text('error'),
    },
    table => [
        uniqueIndex('report_dataset_metadata_pk_idx').on(
            table.accountId,
            table.timestamp,
            table.aggregation
        ),
    ]
);

export const performance = pgTable(
    'performance',
    {
        accountId: text('account_id').notNull(),
        date: timestamp('date', { withTimezone: false, mode: 'date' }).notNull(), // utc
        aggregation: text('aggregation').notNull(), // daily or hourly

        campaignId: text('campaign_id').notNull(),
        adGroupId: text('ad_group_id').notNull(),
        adId: text('ad_id').notNull(),

        targetId: text('target_id').notNull(),
        targetMatchType: text('target_match_type').notNull(),
        searchTerm: text('search_term').notNull(),
        matchedTarget: text('matched_target').notNull(),

        impressions: integer('impressions').notNull(),
        clicks: integer('clicks').notNull(),
        spend: numeric('spend', { precision: 7, scale: 2 }).notNull(),
        sales: numeric('sales', { precision: 10, scale: 2 }).notNull(),
        orders: integer('orders_14d').notNull(),
    },
    table => [
        // 1. PRIMARY COMPOSITE KEY (Required for Timescale/Upsert)
        uniqueIndex('performance_pk_idx').on(
            table.accountId,
            table.date,
            table.aggregation,
            table.adId,
            table.targetId
        ),

        // 2. ANALYTICAL/ROLLUP INDEXES
        index('idx_campaign_time').on(table.campaignId, table.date),
        index('idx_ad_group_time').on(table.adGroupId, table.date),
        index('idx_ad_time').on(table.adId, table.date),
        index('idx_target_time').on(table.targetId, table.date),
    ]
);

/**
 * ----------------------------------------------------------------------------
 * Marketing Streams
 * ----------------------------------------------------------------------------
 */
export const amsCmCampaigns = pgTable(
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
    table => [uniqueIndex('ams_cm_campaigns_campaign_id_idx').on(table.campaignId)]
);

export const amsCmAdgroups = pgTable(
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
    table => [
        uniqueIndex('ams_cm_adgroups_ad_group_id_campaign_id_idx').on(
            table.adGroupId,
            table.campaignId
        ),
    ]
);

export const amsCmAds = pgTable(
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
    table => [uniqueIndex('ams_cm_ads_ad_id_idx').on(table.adId)]
);

export const amsCmTargets = pgTable(
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
    table => [uniqueIndex('ams_cm_targets_target_id_idx').on(table.targetId)]
);

export const amsSpTraffic = pgTable(
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
    table => [uniqueIndex('ams_sp_traffic_idempotency_id_idx').on(table.idempotencyId)]
);

export const amsSpConversion = pgTable(
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
    table => [uniqueIndex('ams_sp_conversion_idempotency_id_idx').on(table.idempotencyId)]
);

export const amsBudgetUsage = pgTable(
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
    table => [
        uniqueIndex('ams_budget_usage_advertiser_marketplace_budget_scope_timestamp_idx').on(
            table.advertiserId,
            table.marketplaceId,
            table.budgetScopeId,
            table.usageUpdatedTimestamp
        ),
    ]
);

/**
 * ----------------------------------------------------------------------------
 * Worker Control
 * ----------------------------------------------------------------------------
 *
 * Worker control table - stores whether the queue processor is enabled
 * This table should only ever have one row (id = 'main')
 */
export const workerControl = pgTable('worker_control', {
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
