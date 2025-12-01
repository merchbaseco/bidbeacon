DROP TABLE IF EXISTS "ams_cm_targets";--> statement-breakpoint
DROP TABLE IF EXISTS "ams_cm_ads";--> statement-breakpoint
DROP TABLE IF EXISTS "ams_cm_adgroups";--> statement-breakpoint
DROP TABLE IF EXISTS "ams_cm_campaigns";--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ams_cm_campaigns" (
	"dataset_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"portfolio_id" text,
	"ad_product" text NOT NULL,
	"marketplace_scope" text,
	"marketplaces" jsonb,
	"name" text NOT NULL,
	"skan_app_id" text,
	"start_date_time" timestamp with time zone,
	"end_date_time" timestamp with time zone,
	"creation_date_time" timestamp with time zone,
	"last_updated_date_time" timestamp with time zone,
	"targets_amazon_deal" boolean,
	"brand_id" text,
	"cost_type" text,
	"sales_channel" text,
	"is_multi_ad_groups_enabled" boolean,
	"purchase_order_number" text,
	"state" jsonb,
	"status" jsonb,
	"tags" jsonb,
	"budgets" jsonb,
	"frequencies" jsonb,
	"auto_creation_settings" jsonb,
	"optimizations" jsonb,
	"fee" jsonb,
	"flights" jsonb
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ams_cm_adgroups" (
	"dataset_id" text NOT NULL,
	"ad_group_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_product" text NOT NULL,
	"marketplace_scope" text,
	"marketplaces" jsonb,
	"name" text NOT NULL,
	"creation_date_time" timestamp with time zone,
	"last_updated_date_time" timestamp with time zone,
	"start_date_time" timestamp with time zone,
	"end_date_time" timestamp with time zone,
	"inventory_type" text,
	"creative_rotation_type" text,
	"purchase_order_number" text,
	"advertised_product_category_ids" jsonb,
	"state" jsonb,
	"status" jsonb,
	"bid" jsonb,
	"optimization" jsonb,
	"budgets" jsonb,
	"pacing" jsonb,
	"frequencies" jsonb,
	"targeting_settings" jsonb,
	"tags" jsonb,
	"fees" jsonb
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ams_cm_ads" (
	"dataset_id" text NOT NULL,
	"ad_id" text NOT NULL,
	"ad_group_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_product" text NOT NULL,
	"marketplace_scope" text,
	"marketplaces" jsonb,
	"name" text NOT NULL,
	"creation_date_time" timestamp with time zone,
	"last_updated_date_time" timestamp with time zone,
	"ad_type" text,
	"state" jsonb,
	"status" jsonb,
	"creative" jsonb,
	"tags" jsonb
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ams_cm_targets" (
	"dataset_id" text NOT NULL,
	"target_id" text NOT NULL,
	"ad_group_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_product" text NOT NULL,
	"marketplace_scope" text,
	"marketplaces" jsonb,
	"negative" boolean,
	"target_level" text,
	"creation_date_time" timestamp with time zone,
	"last_updated_date_time" timestamp with time zone,
	"target_type" text,
	"state" jsonb,
	"status" jsonb,
	"bid" jsonb,
	"target_details" jsonb,
	"tags" jsonb
);--> statement-breakpoint
CREATE UNIQUE INDEX "ams_cm_campaigns_campaign_id_idx" ON "ams_cm_campaigns" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ams_cm_adgroups_ad_group_id_campaign_id_idx" ON "ams_cm_adgroups" USING btree ("ad_group_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ams_cm_ads_ad_id_idx" ON "ams_cm_ads" USING btree ("ad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ams_cm_targets_target_id_idx" ON "ams_cm_targets" USING btree ("target_id");