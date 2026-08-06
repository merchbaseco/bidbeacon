CREATE TABLE "performance_daily_placement" (
	"account_id" text NOT NULL,
	"country_code" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"bucket_date" date NOT NULL,
	"campaign_id" text NOT NULL,
	"placement" text NOT NULL,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"spend" numeric(7, 2) NOT NULL,
	"sales" numeric(10, 2) NOT NULL,
	"purchases" integer NOT NULL,
	CONSTRAINT "performance_daily_placement_account_id_country_code_bucket_date_campaign_id_placement_pk" PRIMARY KEY("account_id","country_code","bucket_date","campaign_id","placement")
);
--> statement-breakpoint
DROP INDEX "report_dataset_metadata_unique_idx";--> statement-breakpoint
CREATE INDEX "idx_perf_daily_placement_campaign_date" ON "performance_daily_placement" USING btree ("account_id","country_code","campaign_id","bucket_date");--> statement-breakpoint
CREATE INDEX "idx_perf_daily_placement_date" ON "performance_daily_placement" USING btree ("account_id","country_code","bucket_date");--> statement-breakpoint
CREATE UNIQUE INDEX "report_dataset_metadata_placement_unique_idx" ON "report_dataset_metadata" USING btree ("account_id","country_code","period_start","aggregation","entity_type") WHERE "report_dataset_metadata"."entity_type" = 'placement';--> statement-breakpoint
CREATE UNIQUE INDEX "report_dataset_metadata_unique_idx" ON "report_dataset_metadata" USING btree ("account_id","period_start","aggregation","entity_type") WHERE "report_dataset_metadata"."entity_type" <> 'placement';