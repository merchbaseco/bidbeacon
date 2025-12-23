import { bigint, boolean, date, doublePrecision, index, integer, jsonb, numeric, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
        accountId: text('account_id'),
        countryCode: text('country_code'),
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
    table => [uniqueIndex('ad_group_ad_group_id_idx').on(table.adGroupId), index('ad_group_campaign_id_idx').on(table.campaignId)]
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
    table => [uniqueIndex('target_target_id_idx').on(table.targetId), index('target_ad_group_id_idx').on(table.adGroupId)]
);

/**
 * ----------------------------------------------------------------------------
 * Account Dataset Metadata
 * ----------------------------------------------------------------------------
 * Tracks when ad entity exports (campaigns, ad groups, ads, targets) were last
 * synced for a given account+countryCode combination.
 */
export const accountDatasetMetadata = pgTable(
    'account_dataset_metadata',
    {
        accountId: text('account_id').notNull(),
        countryCode: text('country_code').notNull(),
        lastSyncStarted: timestamp('last_sync_started', { withTimezone: false, mode: 'date' }), // utc
        lastSyncCompleted: timestamp('last_sync_completed', { withTimezone: false, mode: 'date' }), // utc
        campaignsCount: integer('campaigns_count'),
        adGroupsCount: integer('ad_groups_count'),
        adsCount: integer('ads_count'),
        targetsCount: integer('targets_count'),
        error: text('error'),
        // Per-export type fetching status
        fetchingCampaigns: boolean('fetching_campaigns').default(false),
        fetchingCampaignsPollCount: integer('fetching_campaigns_poll_count').default(0),
        fetchingAdGroups: boolean('fetching_ad_groups').default(false),
        fetchingAdGroupsPollCount: integer('fetching_ad_groups_poll_count').default(0),
        fetchingAds: boolean('fetching_ads').default(false),
        fetchingAdsPollCount: integer('fetching_ads_poll_count').default(0),
        fetchingTargets: boolean('fetching_targets').default(false),
        fetchingTargetsPollCount: integer('fetching_targets_poll_count').default(0),
    },
    table => [primaryKey({ columns: [table.accountId, table.countryCode] })]
);

/**
 * ----------------------------------------------------------------------------
 * Report Dataset Metadata
 * ----------------------------------------------------------------------------
 * Tracks when report datasets were last synced for a given account+countryCode combination.
 * Each row represents a specific aggregation + entityType combination at a timestamp.
 */
export const reportDatasetMetadata = pgTable(
    'report_dataset_metadata',
    {
        uid: uuid('uid').primaryKey().defaultRandom(),
        accountId: text('account_id').notNull(),
        countryCode: text('country_code').notNull(),
        periodStart: timestamp('period_start', { withTimezone: false, mode: 'date' }).notNull(), // utc
        aggregation: text('aggregation').notNull(), // hourly, daily
        entityType: text('entity_type').notNull(), // target, product

        status: text('status').notNull(), // enum: missing, fetching, parsing, completed, failed
        refreshing: boolean('refreshing').notNull().default(false), // whether a refresh is currently in progress
        totalRecords: integer('total_records').notNull().default(0),
        successRecords: integer('processed_records').notNull().default(0),
        errorRecords: integer('error_records').notNull().default(0),

        nextRefreshAt: timestamp('next_refresh_at', { withTimezone: false, mode: 'date' }), // utc - when the next refresh should occur based on eligibility
        lastReportCreatedAt: timestamp('last_report_created_at', { withTimezone: false, mode: 'date' }), // timezone-less, represents local time in country's timezone
        reportId: text('report_id'),
        lastProcessedReportId: text('last_processed_report_id'),
        error: text('error'),
    },
    table => [uniqueIndex('report_dataset_metadata_unique_idx').on(table.accountId, table.periodStart, table.aggregation, table.entityType)]
);

export const reportDatasetErrorMetrics = pgTable('report_dataset_metrics', {
    uid: uuid('uid').primaryKey().defaultRandom(),
    reportDatasetMetadataId: uuid('report_dataset_metadata_id')
        .notNull()
        .references(() => reportDatasetMetadata.uid),
    row: jsonb('row').notNull(),
    error: text('error').notNull(),
});

/**
 * =====================================================================================
 * Performance Tables
 * =====================================================================================
 *
 * We use four performance tables, one per granularity:
 *   - performance_hourly
 *   - performance_daily
 *   - performance_monthly
 *   - performance_annual
 *
 * Each table stores performance data exactly as reported by Amazon at that resolution.
 * We do not derive higher-level aggregates from lower-level data, since different
 * reports can have different backfill windows and may not perfectly reconcile.
 *
 * Time columns:
 *   - bucketStart (TIMESTAMPTZ, UTC)
 *       Canonical bucket identity used for ordering, uniqueness, and Timescale
 *       hypertables. This represents the actual start instant of the bucket.
 *
 *   - Local calendar labels
 *       • Hourly:  bucketDate (DATE), bucketHour (0–23)
 *       • Daily:   bucketDate (DATE)
 *       • Monthly: bucketMonth (DATE, first of month)
 *       • Annual:  bucketYear (INT)
 *
 * Local calendar labels match the account’s reporting timezone and are what most
 * queries and UI views should use.
 *
 * DST handling:
 *   - On DST fall-back days, the same local hour can occur twice.
 *   - Hourly tables allow duplicate (bucketDate, bucketHour) values.
 *   - bucketStart remains unique and unambiguous.
 *   - To combine duplicate hours for display, group by bucketDate and bucketHour.
 *
 * Query patterns:
 *   - Daily totals:        GROUP BY bucketDate
 *   - Hourly breakdowns:  GROUP BY bucketDate, bucketHour
 *   - Precise windows:    filter by bucketStart
 *
 * Entity model:
 *   - entityType: 'target' | 'asin'
 *   - entityId:   targetId or ASIN
 *   - targetMatchType applies only to target rows and is nullable for ASIN rows.
 *
 * =====================================================================================
 */

export const performanceHourly = pgTable(
    'performance_hourly',
    {
        accountId: text('account_id').notNull(),

        bucketStart: timestamp('bucket_start', { withTimezone: true, mode: 'date' }).notNull(), // UTC
        bucketDate: date('bucket_date').notNull(), // account-local day label
        bucketHour: smallint('bucket_hour').notNull(), // 0–23 (can duplicate on DST)

        campaignId: text('campaign_id').notNull(),
        adGroupId: text('ad_group_id').notNull(),
        adId: text('ad_id').notNull(),

        entityType: text('entity_type').notNull(), // 'target' | 'asin' | 'search_term'
        entityId: text('entity_id').notNull(), // targetId, ASIN, or search term
        targetMatchType: text('target_match_type'), // nullable for ASIN and search term rows

        impressions: integer('impressions').notNull(),
        clicks: integer('clicks').notNull(),
        spend: numeric('spend', { precision: 7, scale: 2 }).notNull(),
        sales: numeric('sales', { precision: 10, scale: 2 }).notNull(),
        orders: integer('orders_14d').notNull(),
    },
    table => [
        primaryKey({
            columns: [table.accountId, table.bucketStart, table.adId, table.entityType, table.entityId],
        }),

        index('idx_perf_hourly_campaign_time').on(table.campaignId, table.bucketStart),
        index('idx_perf_hourly_adgroup_time').on(table.adGroupId, table.bucketStart),
        index('idx_perf_hourly_ad_time').on(table.adId, table.bucketStart),
        index('idx_perf_hourly_entity_time').on(table.entityType, table.entityId, table.bucketStart),
        index('idx_perf_hourly_local').on(table.accountId, table.bucketDate, table.bucketHour),
    ]
);

export const performanceDaily = pgTable(
    'performance_daily',
    {
        accountId: text('account_id').notNull(),

        bucketStart: timestamp('bucket_start', { withTimezone: true, mode: 'date' }).notNull(), // UTC start-of-day
        bucketDate: date('bucket_date').notNull(), // account-local day label

        campaignId: text('campaign_id').notNull(),
        adGroupId: text('ad_group_id').notNull(),
        adId: text('ad_id').notNull(),

        entityType: text('entity_type').notNull(), // 'target' | 'asin' | 'search_term'
        entityId: text('entity_id').notNull(), // targetId, ASIN, or search term
        targetMatchType: text('target_match_type'), // nullable for ASIN and search term rows

        impressions: integer('impressions').notNull(),
        clicks: integer('clicks').notNull(),
        spend: numeric('spend', { precision: 7, scale: 2 }).notNull(),
        sales: numeric('sales', { precision: 10, scale: 2 }).notNull(),
        orders: integer('orders_14d').notNull(),
    },
    table => [
        primaryKey({
            columns: [table.accountId, table.bucketDate, table.adId, table.entityType, table.entityId],
        }),

        index('idx_perf_daily_campaign_date').on(table.campaignId, table.bucketDate),
        index('idx_perf_daily_adgroup_date').on(table.adGroupId, table.bucketDate),
        index('idx_perf_daily_ad_date').on(table.adId, table.bucketDate),
        index('idx_perf_daily_entity_date').on(table.entityType, table.entityId, table.bucketDate),
    ]
);

export const performanceMonthly = pgTable(
    'performance_monthly',
    {
        accountId: text('account_id').notNull(),

        bucketStart: timestamp('bucket_start', { withTimezone: true, mode: 'date' }).notNull(), // UTC start-of-month
        bucketMonth: date('bucket_month').notNull(), // e.g. 2023-12-01

        campaignId: text('campaign_id').notNull(),
        adGroupId: text('ad_group_id').notNull(),
        adId: text('ad_id').notNull(),

        entityType: text('entity_type').notNull(), // 'target' | 'asin' | 'search_term'
        entityId: text('entity_id').notNull(), // targetId, ASIN, or search term
        targetMatchType: text('target_match_type'), // nullable for ASIN and search term rows

        impressions: integer('impressions').notNull(),
        clicks: integer('clicks').notNull(),
        spend: numeric('spend', { precision: 7, scale: 2 }).notNull(),
        sales: numeric('sales', { precision: 10, scale: 2 }).notNull(),
        orders: integer('orders_14d').notNull(),
    },
    table => [
        primaryKey({
            columns: [table.accountId, table.bucketMonth, table.adId, table.entityType, table.entityId],
        }),

        index('idx_perf_monthly_campaign_month').on(table.campaignId, table.bucketMonth),
        index('idx_perf_monthly_entity_month').on(table.entityType, table.entityId, table.bucketMonth),
    ]
);

export const performanceAnnual = pgTable(
    'performance_annual',
    {
        accountId: text('account_id').notNull(),

        bucketStart: timestamp('bucket_start', { withTimezone: true, mode: 'date' }).notNull(), // UTC Jan 1
        bucketYear: integer('bucket_year').notNull(), // e.g. 2023

        campaignId: text('campaign_id').notNull(),
        adGroupId: text('ad_group_id').notNull(),
        adId: text('ad_id').notNull(),

        entityType: text('entity_type').notNull(), // 'target' | 'asin' | 'search_term'
        entityId: text('entity_id').notNull(), // targetId, ASIN, or search term
        targetMatchType: text('target_match_type'), // nullable for ASIN and search term rows

        impressions: integer('impressions').notNull(),
        clicks: integer('clicks').notNull(),
        spend: numeric('spend', { precision: 7, scale: 2 }).notNull(),
        sales: numeric('sales', { precision: 10, scale: 2 }).notNull(),
        orders: integer('orders_14d').notNull(),
    },
    table => [
        primaryKey({
            columns: [table.accountId, table.bucketYear, table.adId, table.entityType, table.entityId],
        }),

        index('idx_perf_annual_campaign_year').on(table.campaignId, table.bucketYear),
        index('idx_perf_annual_entity_year').on(table.entityType, table.entityId, table.bucketYear),
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
    table => [primaryKey({ columns: [table.campaignId] })]
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
    table => [primaryKey({ columns: [table.adGroupId, table.campaignId] })]
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
    table => [primaryKey({ columns: [table.adId] })]
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
    table => [primaryKey({ columns: [table.targetId] })]
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
    table => [primaryKey({ columns: [table.idempotencyId] })]
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
    table => [primaryKey({ columns: [table.idempotencyId] })]
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
        primaryKey({
            columns: [table.advertiserId, table.marketplaceId, table.budgetScopeId, table.usageUpdatedTimestamp],
        }),
    ]
);

/**
 * ----------------------------------------------------------------------------
 * Amazon Ads API Authentication & Account Management
 * ----------------------------------------------------------------------------
 */
export const advertiserAccount = pgTable(
    'advertiser_account',
    {
        id: uuid('id').primaryKey().defaultRandom(), // Random UUID primary key
        adsAccountId: text('ads_account_id').notNull(), // e.g., "amzn1.ads-account.g.38rle97xonvbq66bhw6gsyl4g"
        accountName: text('account_name').notNull(),
        status: text('status').notNull(), // e.g., "CREATED"
        countryCode: text('country_code').notNull(), // Individual country code (denormalized)
        profileId: text('profile_id'), // Optional profile ID from alternateIds
        entityId: text('entity_id'), // Optional entity ID from alternateIds
        enabled: boolean('enabled').notNull().default(true), // Whether this account is enabled
    },
    table => [
        // Unique constraint to prevent duplicate entries for the same combination
        uniqueIndex('advertiser_account_unique_idx').on(table.adsAccountId, table.countryCode, table.profileId, table.entityId),
        // Unique constraint: adsAccountId + profileId should be unique
        uniqueIndex('advertiser_account_ads_account_id_profile_id_idx').on(table.adsAccountId, table.profileId),
        // Index for querying by adsAccountId
        index('advertiser_account_ads_account_id_idx').on(table.adsAccountId),
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

/**
 * ----------------------------------------------------------------------------
 * API Metrics Tracking
 * ----------------------------------------------------------------------------
 *
 * Tracks invocations of external APIs (e.g., Amazon Ads API) for monitoring
 * and analytics purposes. Aggregated by hour for efficient querying.
 */
export const apiMetrics = pgTable(
    'api_metrics',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        apiName: text('api_name').notNull(), // e.g., 'createReport', 'retrieveReport', 'listAdvertiserAccounts'
        region: text('region').notNull(), // e.g., 'na', 'eu', 'fe'
        statusCode: integer('status_code'), // HTTP status code (null if request failed before response)
        success: boolean('success').notNull(), // Whether the request succeeded
        durationMs: integer('duration_ms').notNull(), // Request duration in milliseconds
        timestamp: timestamp('timestamp', {
            withTimezone: true,
            mode: 'date',
        }).notNull(), // When the API call was made
        error: text('error'), // Error message if request failed
    },
    table => [
        // Index for querying metrics by API name and time range
        index('api_metrics_api_name_timestamp_idx').on(table.apiName, table.timestamp),
        // Index for querying by timestamp (for time-series queries)
        index('api_metrics_timestamp_idx').on(table.timestamp),
    ]
);

/**
 * ----------------------------------------------------------------------------
 * Job Metrics Tracking
 * ----------------------------------------------------------------------------
 *
 * Tracks invocations of background jobs (e.g., update-report-datasets) for monitoring
 * and analytics purposes. Aggregated by 5-minute intervals for efficient querying.
 */
export const jobMetrics = pgTable(
    'job_metrics',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        jobName: text('job_name').notNull(), // e.g., 'update-report-datasets', 'update-report-dataset-for-account'
        success: boolean('success').notNull(), // Whether the job succeeded
        startTime: timestamp('start_time', { withTimezone: true, mode: 'date' }).notNull(), // When the job started
        endTime: timestamp('end_time', { withTimezone: true, mode: 'date' }).notNull(), // When the job completed
        error: text('error'), // Error message if job failed
        metadata: jsonb('metadata'), // Optional job-specific metadata (e.g., { accountCount: 5, jobCount: 5 })
    },
    table => [
        // Index for querying metrics by job name and time range (using endTime for completion time)
        index('job_metrics_job_name_end_time_idx').on(table.jobName, table.endTime),
        // Index for querying by endTime (for time-series queries)
        index('job_metrics_end_time_idx').on(table.endTime),
    ]
);
