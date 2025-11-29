CREATE TABLE "ams_budget_usage" (
	"advertiser_id" text NOT NULL,
	"marketplace_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"budget_scope_id" text NOT NULL,
	"budget_scope_type" text NOT NULL,
	"advertising_product_type" text NOT NULL,
	"budget" double precision NOT NULL,
	"budget_usage_percentage" double precision NOT NULL,
	"usage_updated_timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ams_cm_adgroups" (
	"ad_group_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_product" text NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"delivery_status" text,
	"delivery_reasons" jsonb,
	"creative_type" text,
	"creation_date_time" timestamp with time zone,
	"last_updated_date_time" timestamp with time zone,
	"bid_default_bid" double precision,
	"bid_currency_code" text,
	"optimization_goal_setting_goal" text,
	"optimization_goal_setting_kpi" text
);
--> statement-breakpoint
CREATE TABLE "ams_cm_ads" (
	"ad_id" text NOT NULL,
	"ad_group_id" text,
	"campaign_id" text,
	"ad_product" text,
	"name" text,
	"state" text,
	"delivery_status" text,
	"delivery_reasons" jsonb,
	"creative_type" text,
	"creation_date_time" timestamp with time zone,
	"last_updated_date_time" timestamp with time zone,
	"serving_status" text,
	"serving_reasons" jsonb
);
--> statement-breakpoint
CREATE TABLE "ams_cm_campaigns" (
	"dataset_id" text NOT NULL,
	"advertiser_id" text NOT NULL,
	"marketplace_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"account_id" text NOT NULL,
	"portfolio_id" text,
	"ad_product" text NOT NULL,
	"product_location" text,
	"version" bigint NOT NULL,
	"name" text NOT NULL,
	"start_date_time" timestamp with time zone,
	"end_date_time" timestamp with time zone,
	"state" text,
	"tags" jsonb,
	"targeting_settings" text,
	"budget_budget_cap_monetary_budget_amount" double precision,
	"budget_budget_cap_monetary_budget_currency_code" text,
	"budget_budget_cap_recurrence_recurrence_type" text,
	"bid_setting_bid_strategy" text,
	"bid_setting_placement_bid_adjustment" jsonb,
	"bid_setting_shopper_cohort_bid_adjustment" jsonb,
	"audit_creation_date_time" timestamp with time zone,
	"audit_last_updated_date_time" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ams_cm_targets" (
	"target_id" text NOT NULL,
	"ad_group_id" text,
	"campaign_id" text,
	"ad_product" text,
	"expression_type" text,
	"expression" jsonb,
	"state" text,
	"start_date_time" timestamp with time zone,
	"end_date_time" timestamp with time zone,
	"creation_date_time" timestamp with time zone,
	"last_updated_date_time" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ams_sp_conversion" (
	"idempotency_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"marketplace_id" text NOT NULL,
	"currency" text NOT NULL,
	"advertiser_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_group_id" text NOT NULL,
	"ad_id" text NOT NULL,
	"keyword_id" text NOT NULL,
	"placement" text NOT NULL,
	"time_window_start" timestamp with time zone NOT NULL,
	"attributed_conversions_1d" bigint,
	"attributed_conversions_7d" bigint,
	"attributed_conversions_14d" bigint,
	"attributed_conversions_30d" bigint,
	"attributed_conversions_1d_same_sku" bigint,
	"attributed_conversions_7d_same_sku" bigint,
	"attributed_conversions_14d_same_sku" bigint,
	"attributed_conversions_30d_same_sku" bigint,
	"attributed_sales_1d" double precision,
	"attributed_sales_7d" double precision,
	"attributed_sales_14d" double precision,
	"attributed_sales_30d" double precision,
	"attributed_sales_1d_same_sku" double precision,
	"attributed_sales_7d_same_sku" double precision,
	"attributed_sales_14d_same_sku" double precision,
	"attributed_sales_30d_same_sku" double precision,
	"attributed_units_ordered_1d" bigint,
	"attributed_units_ordered_7d" bigint,
	"attributed_units_ordered_14d" bigint,
	"attributed_units_ordered_30d" bigint,
	"attributed_units_ordered_1d_same_sku" bigint,
	"attributed_units_ordered_7d_same_sku" bigint,
	"attributed_units_ordered_14d_same_sku" bigint,
	"attributed_units_ordered_30d_same_sku" bigint
);
--> statement-breakpoint
CREATE TABLE "ams_sp_traffic" (
	"idempotency_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"marketplace_id" text NOT NULL,
	"currency" text NOT NULL,
	"advertiser_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_group_id" text NOT NULL,
	"ad_id" text NOT NULL,
	"keyword_id" text NOT NULL,
	"keyword_text" text NOT NULL,
	"match_type" text NOT NULL,
	"placement" text NOT NULL,
	"time_window_start" timestamp with time zone NOT NULL,
	"clicks" bigint NOT NULL,
	"impressions" bigint NOT NULL,
	"cost" double precision NOT NULL
);
--> statement-breakpoint
DROP TABLE "items" CASCADE;