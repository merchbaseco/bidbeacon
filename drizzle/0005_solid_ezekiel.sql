DROP INDEX "ams_cm_campaigns_campaign_id_version_idx";--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ALTER COLUMN "state" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ALTER COLUMN "state" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ams_cm_ads" ALTER COLUMN "ad_group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ams_cm_ads" ALTER COLUMN "campaign_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ams_cm_ads" ALTER COLUMN "ad_product" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ams_cm_ads" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ams_cm_ads" ALTER COLUMN "state" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ALTER COLUMN "state" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ALTER COLUMN "ad_group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ALTER COLUMN "campaign_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ALTER COLUMN "ad_product" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ALTER COLUMN "state" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "dataset_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "marketplace_scope" text;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "marketplaces" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "start_date_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "end_date_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "inventory_type" text;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "creative_rotation_type" text;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "purchase_order_number" text;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "advertised_product_category_ids" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "status" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "bid" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "optimization" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "budgets" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "pacing" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "frequencies" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "targeting_settings" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "tags" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD COLUMN "fees" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_ads" ADD COLUMN "dataset_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ams_cm_ads" ADD COLUMN "marketplace_scope" text;--> statement-breakpoint
ALTER TABLE "ams_cm_ads" ADD COLUMN "marketplaces" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_ads" ADD COLUMN "ad_type" text;--> statement-breakpoint
ALTER TABLE "ams_cm_ads" ADD COLUMN "status" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_ads" ADD COLUMN "creative" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_ads" ADD COLUMN "tags" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "marketplace_scope" text;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "marketplaces" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "skan_app_id" text;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "creation_date_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "last_updated_date_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "targets_amazon_deal" boolean;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "brand_id" text;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "cost_type" text;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "sales_channel" text;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "is_multi_ad_groups_enabled" boolean;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "purchase_order_number" text;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "status" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "budgets" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "frequencies" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "auto_creation_settings" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "optimizations" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "fee" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD COLUMN "flights" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ADD COLUMN "dataset_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ADD COLUMN "marketplace_scope" text;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ADD COLUMN "marketplaces" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ADD COLUMN "negative" boolean;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ADD COLUMN "target_level" text;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ADD COLUMN "target_type" text;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ADD COLUMN "status" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ADD COLUMN "bid" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ADD COLUMN "target_details" jsonb;--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ADD COLUMN "tags" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "ams_cm_campaigns_campaign_id_idx" ON "ams_cm_campaigns" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" DROP COLUMN "delivery_status";--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" DROP COLUMN "delivery_reasons";--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" DROP COLUMN "creative_type";--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" DROP COLUMN "bid_default_bid";--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" DROP COLUMN "bid_currency_code";--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" DROP COLUMN "optimization_goal_setting_goal";--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" DROP COLUMN "optimization_goal_setting_kpi";--> statement-breakpoint
ALTER TABLE "ams_cm_ads" DROP COLUMN "delivery_status";--> statement-breakpoint
ALTER TABLE "ams_cm_ads" DROP COLUMN "delivery_reasons";--> statement-breakpoint
ALTER TABLE "ams_cm_ads" DROP COLUMN "creative_type";--> statement-breakpoint
ALTER TABLE "ams_cm_ads" DROP COLUMN "serving_status";--> statement-breakpoint
ALTER TABLE "ams_cm_ads" DROP COLUMN "serving_reasons";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "advertiser_id";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "marketplace_id";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "account_id";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "product_location";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "targeting_settings";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "budget_budget_cap_monetary_budget_amount";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "budget_budget_cap_monetary_budget_currency_code";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "budget_budget_cap_recurrence_recurrence_type";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "bid_setting_bid_strategy";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "bid_setting_placement_bid_adjustment";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "bid_setting_shopper_cohort_bid_adjustment";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "audit_creation_date_time";--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" DROP COLUMN "audit_last_updated_date_time";--> statement-breakpoint
ALTER TABLE "ams_cm_targets" DROP COLUMN "expression_type";--> statement-breakpoint
ALTER TABLE "ams_cm_targets" DROP COLUMN "expression";--> statement-breakpoint
ALTER TABLE "ams_cm_targets" DROP COLUMN "start_date_time";--> statement-breakpoint
ALTER TABLE "ams_cm_targets" DROP COLUMN "end_date_time";