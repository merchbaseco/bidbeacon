CREATE TABLE "performance_annual" (
	"account_id" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"bucket_year" integer NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_group_id" text NOT NULL,
	"ad_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"target_match_type" text,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"spend" numeric(7, 2) NOT NULL,
	"sales" numeric(10, 2) NOT NULL,
	"orders_14d" integer NOT NULL,
	CONSTRAINT "performance_annual_account_id_bucket_year_ad_id_entity_type_entity_id_pk" PRIMARY KEY("account_id","bucket_year","ad_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "performance_daily" (
	"account_id" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"bucket_date" date NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_group_id" text NOT NULL,
	"ad_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"target_match_type" text,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"spend" numeric(7, 2) NOT NULL,
	"sales" numeric(10, 2) NOT NULL,
	"orders_14d" integer NOT NULL,
	CONSTRAINT "performance_daily_account_id_bucket_date_ad_id_entity_type_entity_id_pk" PRIMARY KEY("account_id","bucket_date","ad_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "performance_hourly" (
	"account_id" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"bucket_date" date NOT NULL,
	"bucket_hour" smallint NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_group_id" text NOT NULL,
	"ad_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"target_match_type" text,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"spend" numeric(7, 2) NOT NULL,
	"sales" numeric(10, 2) NOT NULL,
	"orders_14d" integer NOT NULL,
	CONSTRAINT "performance_hourly_account_id_bucket_start_ad_id_entity_type_entity_id_pk" PRIMARY KEY("account_id","bucket_start","ad_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "performance_monthly" (
	"account_id" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"bucket_month" date NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_group_id" text NOT NULL,
	"ad_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"target_match_type" text,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"spend" numeric(7, 2) NOT NULL,
	"sales" numeric(10, 2) NOT NULL,
	"orders_14d" integer NOT NULL,
	CONSTRAINT "performance_monthly_account_id_bucket_month_ad_id_entity_type_entity_id_pk" PRIMARY KEY("account_id","bucket_month","ad_id","entity_type","entity_id")
);
--> statement-breakpoint
ALTER TABLE "performance" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "performance" CASCADE;--> statement-breakpoint
ALTER TABLE "report_dataset_metadata" DROP CONSTRAINT "report_dataset_metadata_account_id_timestamp_aggregation_pk";--> statement-breakpoint
ALTER TABLE "report_dataset_metadata" ADD CONSTRAINT "report_dataset_metadata_account_id_timestamp_aggregation_entity_type_pk" PRIMARY KEY("account_id","timestamp","aggregation","entity_type");--> statement-breakpoint
ALTER TABLE "report_dataset_metadata" ADD COLUMN "entity_type" text NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_perf_annual_campaign_year" ON "performance_annual" USING btree ("campaign_id","bucket_year");--> statement-breakpoint
CREATE INDEX "idx_perf_annual_entity_year" ON "performance_annual" USING btree ("entity_type","entity_id","bucket_year");--> statement-breakpoint
CREATE INDEX "idx_perf_daily_campaign_date" ON "performance_daily" USING btree ("campaign_id","bucket_date");--> statement-breakpoint
CREATE INDEX "idx_perf_daily_adgroup_date" ON "performance_daily" USING btree ("ad_group_id","bucket_date");--> statement-breakpoint
CREATE INDEX "idx_perf_daily_ad_date" ON "performance_daily" USING btree ("ad_id","bucket_date");--> statement-breakpoint
CREATE INDEX "idx_perf_daily_entity_date" ON "performance_daily" USING btree ("entity_type","entity_id","bucket_date");--> statement-breakpoint
CREATE INDEX "idx_perf_hourly_campaign_time" ON "performance_hourly" USING btree ("campaign_id","bucket_start");--> statement-breakpoint
CREATE INDEX "idx_perf_hourly_adgroup_time" ON "performance_hourly" USING btree ("ad_group_id","bucket_start");--> statement-breakpoint
CREATE INDEX "idx_perf_hourly_ad_time" ON "performance_hourly" USING btree ("ad_id","bucket_start");--> statement-breakpoint
CREATE INDEX "idx_perf_hourly_entity_time" ON "performance_hourly" USING btree ("entity_type","entity_id","bucket_start");--> statement-breakpoint
CREATE INDEX "idx_perf_hourly_local" ON "performance_hourly" USING btree ("account_id","bucket_date","bucket_hour");--> statement-breakpoint
CREATE INDEX "idx_perf_monthly_campaign_month" ON "performance_monthly" USING btree ("campaign_id","bucket_month");--> statement-breakpoint
CREATE INDEX "idx_perf_monthly_entity_month" ON "performance_monthly" USING btree ("entity_type","entity_id","bucket_month");