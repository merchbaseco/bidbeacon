import { z } from 'zod';

// Base schema for AMS payloads - AMS uses snake_case field names
const baseAmsPayloadSchema = z.object({
    dataset_id: z.string(),
});

// Sponsored Products Traffic schema - AMS uses snake_case
// Based on official AMS Sponsored Products Traffic dataset schema
export const spTrafficSchema = baseAmsPayloadSchema
    .extend({
        idempotency_id: z.string(), // An identifier than can be used to de-duplicate records
        dataset_id: z.string(), // An identifier used to identify the dataset (in this case, sp-traffic)
        marketplace_id: z.string(), // The marketplace identifier associated with the account
        currency: z.string(), // The currency used for all monetary values for entities under the profile
        advertiser_id: z.string(), // ID associated with the advertiser (not unique, may be same across marketplaces; for non-seller accounts, set to entity ID)
        campaign_id: z.string(), // Unique numerical ID for a campaign
        ad_group_id: z.string(), // Unique numerical ID for an ad group
        ad_id: z.string(), // Unique numerical ID for the ad
        keyword_id: z.string(), // ID of the keyword used for a bid
        keyword_text: z.string(), // Text of the keyword or phrase used for a bid
        match_type: z.string(), // Type of matching for the keyword or phrase used in a bid
        placement: z.string(), // The page location where an ad appeared
        time_window_start: z.string(), // The start of the hour to which the performance data is attributed (ISO 8601 date time)
        clicks: z.number().int(), // Total ad clicks (Long)
        impressions: z.number().int(), // Total ad impressions (Long) - Can be negative for corrections
        cost: z.number(), // Total cost of all clicks, expressed in local currency (Double)
    })
    .passthrough();

// Sponsored Products Conversion schema - AMS uses snake_case
// Based on official AMS Sponsored Products Conversion dataset schema
export const spConversionSchema = baseAmsPayloadSchema
    .extend({
        idempotency_id: z.string(), // An identifier than can be used to de-duplicate records
        dataset_id: z.string(), // An identifier used to identify the dataset (in this case, sp-conversion)
        marketplace_id: z.string(), // The marketplace identifier associated with the account
        currency: z.string(), // The currency used for all monetary values for entities under the profile
        advertiser_id: z.string(), // ID associated with the advertiser (not unique, may be same across marketplaces; for non-seller accounts, set to entity ID)
        campaign_id: z.string(), // Unique numerical ID for a campaign
        ad_group_id: z.string(), // Unique numerical ID for an ad group
        ad_id: z.string(), // Unique numerical ID for the ad
        keyword_id: z.string(), // ID of the keyword used for a bid
        placement: z.string(), // The page location where an ad appeared
        time_window_start: z.string(), // The start of the hour to which the performance data is attributed (ISO 8601 date time)
        // All conversion fields are optional - may not be present if no conversions occurred
        // Conversions (Long → integer)
        attributed_conversions_1d: z.number().int().optional(), // Number of attributed conversion events occurring within 24 hours of ad click
        attributed_conversions_7d: z.number().int().optional(), // Number of attributed conversion events occurring within 7 days of an ad click
        attributed_conversions_14d: z.number().int().optional(), // Number of attributed conversion events occurring within 14 days of an ad click
        attributed_conversions_30d: z.number().int().optional(), // Number of attributed conversion events occurring within 30 days of an ad click
        attributed_conversions_1d_same_sku: z.number().int().optional(), // Number of attributed conversion events occurring within 24 hours of ad click where the purchased SKU was the same as the SKU advertised
        attributed_conversions_7d_same_sku: z.number().int().optional(), // Number of attributed conversion events occurring within 7 days of ad click where the purchased SKU was the same as the SKU advertised
        attributed_conversions_14d_same_sku: z.number().int().optional(), // Number of attributed conversion events occurring within 14 days of ad click where the purchased SKU was the same as the SKU advertised
        attributed_conversions_30d_same_sku: z.number().int().optional(), // Number of attributed conversion events occurring within 30 days of ad click where the purchased SKU was the same as the SKU advertised
        // Sales (Double → number)
        attributed_sales_1d: z.number().optional(), // Total value of sales occurring within 24 hours of an ad click
        attributed_sales_7d: z.number().optional(), // Total value of sales occurring within 7 days of an ad click
        attributed_sales_14d: z.number().optional(), // Total value of sales occurring within 14 days of an ad click
        attributed_sales_30d: z.number().optional(), // Total value of sales occurring within 30 days of an ad click
        attributed_sales_1d_same_sku: z.number().optional(), // Total value of sales occurring within 24 hours of ad click where the purchased SKU was the same as the SKU advertised
        attributed_sales_7d_same_sku: z.number().optional(), // Total value of sales occurring within 7 days of ad click where the purchased SKU was the same as the SKU advertised
        attributed_sales_14d_same_sku: z.number().optional(), // Total value of sales occurring within 14 days of ad click where the purchased SKU was the same as the SKU advertised
        attributed_sales_30d_same_sku: z.number().optional(), // Total value of sales occurring within 30 days of ad click where the purchased SKU was the same as the SKU advertised
        // Units ordered (Long → integer)
        attributed_units_ordered_1d: z.number().int().optional(), // Total number of units ordered within 24 hours of an ad click
        attributed_units_ordered_7d: z.number().int().optional(), // Total number of units ordered within 7 days of an ad click
        attributed_units_ordered_14d: z.number().int().optional(), // Total number of units ordered within 14 days of an ad click
        attributed_units_ordered_30d: z.number().int().optional(), // Total number of units ordered within 30 days of an ad click
        attributed_units_ordered_1d_same_sku: z.number().int().optional(), // Total number of units ordered within 24 hours of ad click where the purchased SKU was the same as the SKU advertised
        attributed_units_ordered_7d_same_sku: z.number().int().optional(), // Total number of units ordered within 7 days of ad click where the purchased SKU was the same as the SKU advertised
        attributed_units_ordered_14d_same_sku: z.number().int().optional(), // Total number of units ordered within 14 days of ad click where the purchased SKU was the same as the SKU advertised
        attributed_units_ordered_30d_same_sku: z.number().int().optional(), // Total number of units ordered within 30 days of ad click where the purchased SKU was the same as the SKU advertised
    })
    .passthrough();

// Budget Usage schema - AMS uses snake_case
// Based on official AMS Budget Usage dataset schema
export const budgetUsageSchema = baseAmsPayloadSchema
    .extend({
        dataset_id: z.string(), // An identifier used to uniquely identify a specific dataset
        advertiser_id: z.string(), // ID associated with the advertiser (not unique, may be same across marketplaces)
        marketplace_id: z.string(), // The identifier of the marketplace to which the account is associated
        budget_scope_id: z.string(), // The unique identifier of campaign or portfolio for which budget usage percentage is provided
        budget_scope_type: z.string(), // The type of budget scope: CAMPAIGN or PORTFOLIO
        advertising_product_type: z.string(), // Advertising product type: sp (Sponsored Products), sb (Sponsored Brands), or sd (Sponsored Display)
        budget: z.number(), // Value of budget for budget_scope_id (rule-based budget if any budget rule is winning, otherwise advertiser's set budget)
        budget_usage_percentage: z.number().min(0), // Budget usage percentage (Spend divided by budget) - can exceed 100% for overspending/corrections
        usage_updated_timestamp: z.string(), // Last evaluation time for budget usage (ISO 8601 datetime)
    })
    .passthrough();

// Campaign Management Campaign schema - AMS uses snake_case
// Based on official AMS Campaign Management Campaign dataset schema
export const campaignSchema = baseAmsPayloadSchema
    .extend({
        dataset_id: z.string(),
        campaign_id: z.string(),
        portfolio_id: z.string().optional(),
        ad_product: z.string(),
        marketplace_scope: z.string().optional(), // enum: GLOBAL vs SINGLE_MARKETPLACE
        marketplaces: z.array(z.string()).optional(), // enum[] - List of marketplaces
        name: z.string(),
        skan_app_id: z.string().optional(),
        start_date_time: z.string().optional(), // ISO 8601 datetime
        end_date_time: z.string().optional(), // ISO 8601 datetime
        creation_date_time: z.string().optional(), // ISO 8601 datetime
        last_updated_date_time: z.string().optional(), // ISO 8601 datetime
        targets_amazon_deal: z.boolean().optional(),
        brand_id: z.string().optional(), // 16 chars
        cost_type: z.string().optional(), // enum: CPC / vCPM
        sales_channel: z.string().optional(), // enum: AMAZON / OFF_AMAZON
        is_multi_ad_groups_enabled: z.boolean().optional(),
        purchase_order_number: z.string().optional(),
        // Nested state object
        state: z
            .object({
                state: z.string().optional(), // enum: Default state
                marketplace_settings: z
                    .array(
                        z.object({
                            marketplace: z.string().optional(), // enum: Marketplace
                            state: z.string().optional(), // enum: Marketplace-specific state
                        })
                    )
                    .optional(),
            })
            .optional(),
        // Nested status object
        status: z
            .object({
                delivery_status: z.string().optional(), // enum: Delivering / Not delivering
                delivery_reasons: z.array(z.string()).optional(), // enum[] - Up to 50 reasons
                marketplace_settings: z
                    .array(
                        z.object({
                            marketplace: z.string().optional(), // enum: Marketplace
                            delivery_status: z.string().optional(), // enum: Marketplace-specific delivery state
                            delivery_reasons: z.array(z.string()).optional(), // enum[]: Reasons
                        })
                    )
                    .optional(),
            })
            .optional(),
        // Tags as object with key-value pairs
        tags: z
            .array(
                z.object({
                    key: z.string(),
                    value: z.string(),
                })
            )
            .optional(),
        // Budgets - mixed structure, store as jsonb
        budgets: z.record(z.unknown()).optional(),
        // Frequencies - mixed structure, store as jsonb
        frequencies: z.record(z.unknown()).optional(),
        // Auto creation settings
        auto_creation_settings: z
            .object({
                auto_create_targets: z.boolean().optional(),
            })
            .optional(),
        // Optimizations - mixed structure (bid strategies, goals, budget allocation), store as jsonb
        optimizations: z.record(z.unknown()).optional(),
        // Fee - mixed structure, store as jsonb
        fee: z.record(z.unknown()).optional(),
        // Flights - mixed structure (flight scheduling and budgets), store as jsonb
        flights: z.record(z.unknown()).optional(),
    })
    .passthrough();

// Campaign Management AdGroup schema - AMS uses snake_case
// Based on official AMS Campaign Management AdGroup dataset schema
export const adGroupSchema = baseAmsPayloadSchema
    .extend({
        dataset_id: z.string(),
        ad_group_id: z.string(),
        campaign_id: z.string(),
        ad_product: z.string(),
        marketplace_scope: z.string().optional(), // enum: Global/single marketplace
        marketplaces: z.array(z.string()).optional(), // enum[] - List of marketplaces
        name: z.string(),
        creation_date_time: z.string().optional(), // ISO 8601 datetime
        last_updated_date_time: z.string().optional(), // ISO 8601 datetime
        start_date_time: z.string().optional(), // ISO 8601 datetime
        end_date_time: z.string().optional(), // ISO 8601 datetime
        inventory_type: z.string().optional(), // enum: What inventory this ad group can appear on
        creative_rotation_type: z.string().optional(), // enum: RANDOM / WEIGHTED
        purchase_order_number: z.string().optional(),
        advertised_product_category_ids: z.array(z.string()).optional(), // string[] - Product category IDs
        // Nested state object
        state: z
            .object({
                state: z.string().optional(), // enum: Default state
                marketplace_settings: z.record(z.unknown()).optional(), // Marketplace state overrides
            })
            .optional(),
        // Nested status object
        status: z.record(z.unknown()).optional(), // Delivery info - enum
        // Nested bid object
        bid: z
            .object({
                bid: z
                    .object({
                        default_bid: z.number().optional(), // double: Default bid
                        base_bid: z.number().optional(), // double: Lower bound bid
                        currency_code: z.string().optional(), // enum: Currency
                        max_average_bid: z.number().optional(), // double: Max targeted average bid
                    })
                    .optional(),
                marketplace_settings: z.record(z.unknown()).optional(), // Marketplace bid overrides - mixed
            })
            .optional(),
        // Nested optimization object
        optimization: z
            .object({
                bid_strategy: z.string().optional(), // enum: Auto bidding strategy
                budget_settings: z.record(z.unknown()).optional(), // Budget allocation settings - mixed
            })
            .optional(),
        // Mixed structures stored as jsonb
        budgets: z.record(z.unknown()).optional(), // Budget caps and marketplace budget settings
        pacing: z.record(z.unknown()).optional(), // Delivery pacing
        frequencies: z.record(z.unknown()).optional(), // Frequency caps
        targeting_settings: z.record(z.unknown()).optional(), // Language, viewability, audience, etc.
        // Tags as array of key-value objects
        tags: z
            .array(
                z.object({
                    key: z.string(),
                    value: z.string(),
                })
            )
            .optional(),
        fees: z.record(z.unknown()).optional(), // Fee metadata - mixed
    })
    .passthrough();

// Campaign Management Ad schema - AMS uses snake_case
// Based on official AMS Campaign Management Ad dataset schema
export const adSchema = baseAmsPayloadSchema
    .extend({
        dataset_id: z.string(),
        ad_id: z.string(),
        ad_group_id: z.string(),
        campaign_id: z.string(), // Read-only parent campaign
        ad_product: z.string(), // enum: SP / SB / DSP
        marketplace_scope: z.string().optional(), // enum: Global/single marketplace
        marketplaces: z.array(z.string()).optional(), // enum[] - List of marketplaces
        name: z.string(),
        creation_date_time: z.string().optional(), // ISO 8601 datetime
        last_updated_date_time: z.string().optional(), // ISO 8601 datetime
        ad_type: z.string().optional(), // enum: VIDEO / COMPONENT / PRODUCT_AD
        // Nested state object
        state: z
            .object({
                state: z.string().optional(), // enum: Default state
                marketplace_settings: z.record(z.unknown()).optional(), // State per marketplace - enum
            })
            .optional(),
        // Nested status object
        status: z
            .object({
                delivery_status: z.string().optional(), // enum: Delivering / Not delivering
                delivery_reasons: z.array(z.string()).optional(), // enum[]: Delivery reasons
                marketplace_settings: z.record(z.unknown()).optional(), // Per-marketplace delivery info - mixed
            })
            .optional(),
        // Nested creative object
        creative: z
            .object({
                product_creative: z.record(z.unknown()).optional(), // Advertised product + headline + store settings - mixed
            })
            .optional(),
        // Tags as array of key-value objects
        tags: z
            .array(
                z.object({
                    key: z.string(),
                    value: z.string(),
                })
            )
            .optional(),
    })
    .passthrough();

// Campaign Management Target schema - AMS uses snake_case
// Based on official AMS Campaign Management Target dataset schema
export const targetSchema = baseAmsPayloadSchema
    .extend({
        dataset_id: z.string(),
        target_id: z.string(),
        ad_group_id: z.string(),
        campaign_id: z.string(),
        ad_product: z.string(), // enum: Ad product
        marketplace_scope: z.string().optional(), // enum: Global/single marketplace
        marketplaces: z.array(z.string()).optional(), // enum[] - List of marketplaces
        negative: z.boolean().optional(), // Is negative target
        target_level: z.string().optional(), // enum: CAMPAIGN / AD_GROUP
        creation_date_time: z.string().optional(), // ISO 8601 datetime
        last_updated_date_time: z.string().optional(), // ISO 8601 datetime
        target_type: z.string().optional(), // enum: Massive list of target types
        // Nested state object
        state: z
            .object({
                state: z.string().optional(), // enum: Default state
                marketplace_settings: z.record(z.unknown()).optional(), // Marketplace-specific state - enum
            })
            .optional(),
        // Nested status object
        status: z.record(z.unknown()).optional(), // Delivery info - enum
        // Nested bid object
        bid: z
            .object({
                bid: z
                    .object({
                        bid: z.number().optional(), // double: Bid amount
                        currency_code: z.string().optional(), // enum: Currency
                    })
                    .optional(),
                marketplace_settings: z.record(z.unknown()).optional(), // Per-marketplace bid overrides - mixed
            })
            .optional(),
        // Nested target_details object (keyword_target is one type)
        target_details: z
            .object({
                keyword_target: z
                    .object({
                        match_type: z.string().optional(), // enum: EXACT / PHRASE / BROAD
                        keyword: z.record(z.unknown()).optional(), // Raw + localized keyword text - mixed
                        native_language_locale: z.string().optional(), // enum: Locale
                    })
                    .optional(),
            })
            .optional(),
        // Tags as array of key-value objects
        tags: z
            .array(
                z.object({
                    key: z.string(),
                    value: z.string(),
                })
            )
            .optional(),
    })
    .passthrough();
