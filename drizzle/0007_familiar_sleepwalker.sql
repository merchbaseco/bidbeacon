CREATE TABLE "ad" (
	"id" text PRIMARY KEY NOT NULL,
	"ad_id" text NOT NULL,
	"ad_group_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_product" text NOT NULL,
	"ad_type" text NOT NULL,
	"state" text NOT NULL,
	"delivery_status" text NOT NULL,
	"product_asin" text,
	"creation_date_time" timestamp NOT NULL,
	"last_updated_date_time" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_group" (
	"id" text PRIMARY KEY NOT NULL,
	"ad_group_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"ad_product" text NOT NULL,
	"state" text NOT NULL,
	"delivery_status" text NOT NULL,
	"bid_amount" numeric(4, 2),
	"creation_date_time" timestamp NOT NULL,
	"last_updated_date_time" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"portfolio_id" text,
	"name" text NOT NULL,
	"ad_product" text NOT NULL,
	"state" text NOT NULL,
	"delivery_status" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"targeting_settings" text NOT NULL,
	"bid_strategy" text,
	"budget_type" text,
	"budget_period" text,
	"budget_amount" numeric(6, 2),
	"creation_date_time" timestamp NOT NULL,
	"last_updated_date_time" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance" (
	"account_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"aggregation" text NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_group_id" text NOT NULL,
	"ad_id" text NOT NULL,
	"target_id" text NOT NULL,
	"target_match_type" text NOT NULL,
	"search_term" text NOT NULL,
	"matched_target" text NOT NULL,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"spend" numeric(7, 2) NOT NULL,
	"sales" numeric(10, 2) NOT NULL,
	"orders_14d" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_dataset_metadata" (
	"account_id" text NOT NULL,
	"timestamp" timestamp NOT NULL,
	"aggregation" text NOT NULL,
	"status" text NOT NULL,
	"last_refreshed" timestamp,
	"report_id" text NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "target" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"target_id" text NOT NULL,
	"ad_group_id" text,
	"ad_product" text NOT NULL,
	"state" text NOT NULL,
	"negative" boolean NOT NULL,
	"bid_amount" numeric(4, 2),
	"target_details_match_type" text,
	"target_details_asin" text,
	"target_details_keyword" text,
	"target_type" text NOT NULL,
	"delivery_status" text NOT NULL,
	"creation_date_time" timestamp NOT NULL,
	"last_updated_date_time" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ad_ad_id_idx" ON "ad" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX "ad_ad_group_id_idx" ON "ad" USING btree ("ad_group_id");--> statement-breakpoint
CREATE INDEX "ad_product_asin_idx" ON "ad" USING btree ("product_asin");--> statement-breakpoint
CREATE INDEX "ad_product_asin_state_idx" ON "ad" USING btree ("product_asin","state");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_group_ad_group_id_idx" ON "ad_group" USING btree ("ad_group_id");--> statement-breakpoint
CREATE INDEX "ad_group_campaign_id_idx" ON "ad_group" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_campaign_id_idx" ON "campaign" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "performance_pk_idx" ON "performance" USING btree ("account_id","date","aggregation","ad_id","target_id");--> statement-breakpoint
CREATE INDEX "idx_campaign_time" ON "performance" USING btree ("campaign_id","date");--> statement-breakpoint
CREATE INDEX "idx_ad_group_time" ON "performance" USING btree ("ad_group_id","date");--> statement-breakpoint
CREATE INDEX "idx_ad_time" ON "performance" USING btree ("ad_id","date");--> statement-breakpoint
CREATE INDEX "idx_target_time" ON "performance" USING btree ("target_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "report_dataset_metadata_pk_idx" ON "report_dataset_metadata" USING btree ("account_id","timestamp","aggregation");--> statement-breakpoint
CREATE UNIQUE INDEX "target_target_id_idx" ON "target" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "target_ad_group_id_idx" ON "target" USING btree ("ad_group_id");