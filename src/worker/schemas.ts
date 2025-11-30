import { z } from 'zod';

// Base schema for AMS payloads - AMS uses snake_case field names
const baseAmsPayloadSchema = z.object({
    dataset_id: z.string(),
});

// Sponsored Products Traffic schema - AMS uses snake_case
export const spTrafficSchema = baseAmsPayloadSchema
    .extend({
        dataset_id: z.string(),
        marketplace_id: z.string(),
        currency: z.string(),
        advertiser_id: z.string(),
        campaign_id: z.string(),
        ad_group_id: z.string(),
        ad_id: z.string(),
        keyword_id: z.string(),
        keyword_text: z.string(),
        match_type: z.string(),
        placement: z.string(),
        time_window_start: z.string(), // ISO 8601 timestamp
        clicks: z.number().int(),
        impressions: z.number().int(), // Can be negative for corrections
        cost: z.number(),
        idempotency_id: z.string(),
    })
    .passthrough();

// Sponsored Products Conversion schema - AMS uses snake_case
export const spConversionSchema = baseAmsPayloadSchema
    .extend({
        dataset_id: z.string(),
        marketplace_id: z.string(),
        currency: z.string(),
        advertiser_id: z.string(),
        campaign_id: z.string(),
        ad_group_id: z.string(),
        ad_id: z.string(),
        keyword_id: z.string(),
        placement: z.string(),
        time_window_start: z.string(), // ISO 8601 timestamp
        idempotency_id: z.string(),
        // All conversion fields are optional - AMS uses snake_case
        attributed_conversions_1d: z.number().int().optional(),
        attributed_conversions_7d: z.number().int().optional(),
        attributed_conversions_14d: z.number().int().optional(),
        attributed_conversions_30d: z.number().int().optional(),
        attributed_conversions_1d_same_sku: z.number().int().optional(),
        attributed_conversions_7d_same_sku: z.number().int().optional(),
        attributed_conversions_14d_same_sku: z.number().int().optional(),
        attributed_conversions_30d_same_sku: z.number().int().optional(),
        attributed_sales_1d: z.number().optional(),
        attributed_sales_7d: z.number().optional(),
        attributed_sales_14d: z.number().optional(),
        attributed_sales_30d: z.number().optional(),
        attributed_sales_1d_same_sku: z.number().optional(),
        attributed_sales_7d_same_sku: z.number().optional(),
        attributed_sales_14d_same_sku: z.number().optional(),
        attributed_sales_30d_same_sku: z.number().optional(),
        attributed_units_ordered_1d: z.number().int().optional(),
        attributed_units_ordered_7d: z.number().int().optional(),
        attributed_units_ordered_14d: z.number().int().optional(),
        attributed_units_ordered_30d: z.number().int().optional(),
        attributed_units_ordered_1d_same_sku: z.number().int().optional(),
        attributed_units_ordered_7d_same_sku: z.number().int().optional(),
        attributed_units_ordered_14d_same_sku: z.number().int().optional(),
        attributed_units_ordered_30d_same_sku: z.number().int().optional(),
    })
    .passthrough();

// Budget Usage schema - AMS uses snake_case
export const budgetUsageSchema = baseAmsPayloadSchema
    .extend({
        dataset_id: z.string(),
        advertiser_id: z.string(),
        marketplace_id: z.string(),
        budget_scope_id: z.string(),
        budget_scope_type: z.string(),
        advertising_product_type: z.string(),
        budget: z.number(),
        budget_usage_percentage: z.number().min(0).max(100),
        usage_updated_timestamp: z.string(), // ISO 8601 timestamp
    })
    .passthrough();

// Campaign Management Campaign schema - AMS uses snake_case
export const campaignSchema = baseAmsPayloadSchema
    .extend({
        dataset_id: z.string(),
        advertiser_id: z.string(),
        marketplace_id: z.string(),
        campaign_id: z.string(),
        account_id: z.string(),
        portfolio_id: z.string().optional(),
        ad_product: z.string(),
        product_location: z.string().optional(),
        version: z.number().int().positive(),
        name: z.string(),
        start_date_time: z.string().optional(), // ISO 8601 timestamp
        end_date_time: z.string().optional(), // ISO 8601 timestamp
        state: z.string().optional(),
        tags: z.record(z.unknown()).optional(),
        targeting_settings: z.string().optional(),
        budget_budget_cap_monetary_budget_amount: z.number().optional(),
        budget_budget_cap_monetary_budget_currency_code: z.string().optional(),
        budget_budget_cap_recurrence_recurrence_type: z.string().optional(),
        bid_setting_bid_strategy: z.string().optional(),
        bid_setting_placement_bid_adjustment: z.record(z.unknown()).optional(),
        bid_setting_shopper_cohort_bid_adjustment: z.record(z.unknown()).optional(),
        audit_creation_date_time: z.string().optional(), // ISO 8601 timestamp
        audit_last_updated_date_time: z.string().optional(), // ISO 8601 timestamp
    })
    .passthrough();

// Campaign Management AdGroup schema - AMS uses snake_case
export const adGroupSchema = baseAmsPayloadSchema
    .extend({
        ad_group_id: z.string(),
        campaign_id: z.string(),
        ad_product: z.string(),
        name: z.string(),
        state: z.string(),
        delivery_status: z.string().optional(),
        delivery_reasons: z.array(z.unknown()).optional(),
        creative_type: z.string().optional(),
        creation_date_time: z.string().optional(), // ISO 8601 timestamp
        last_updated_date_time: z.string().optional(), // ISO 8601 timestamp
        bid_default_bid: z.number().optional(),
        bid_currency_code: z.string().optional(),
        optimization_goal_setting_goal: z.string().optional(),
        optimization_goal_setting_kpi: z.string().optional(),
    })
    .passthrough();

// Campaign Management Ad schema - AMS uses snake_case
export const adSchema = baseAmsPayloadSchema
    .extend({
        ad_id: z.string(),
        ad_group_id: z.string().optional(),
        campaign_id: z.string().optional(),
        ad_product: z.string().optional(),
        name: z.string().optional(),
        state: z.string().optional(),
        delivery_status: z.string().optional(),
        delivery_reasons: z.array(z.unknown()).optional(),
        creative_type: z.string().optional(),
        creation_date_time: z.string().optional(), // ISO 8601 timestamp
        last_updated_date_time: z.string().optional(), // ISO 8601 timestamp
        serving_status: z.string().optional(),
        serving_reasons: z.array(z.unknown()).optional(),
    })
    .passthrough();

// Campaign Management Target schema - AMS uses snake_case
export const targetSchema = baseAmsPayloadSchema
    .extend({
        target_id: z.string(),
        ad_group_id: z.string().optional(),
        campaign_id: z.string().optional(),
        ad_product: z.string().optional(),
        expression_type: z.string().optional(),
        expression: z.record(z.unknown()).optional(),
        state: z.string().optional(),
        start_date_time: z.string().optional(), // ISO 8601 timestamp
        end_date_time: z.string().optional(), // ISO 8601 timestamp
        creation_date_time: z.string().optional(), // ISO 8601 timestamp
        last_updated_date_time: z.string().optional(), // ISO 8601 timestamp
    })
    .passthrough();
