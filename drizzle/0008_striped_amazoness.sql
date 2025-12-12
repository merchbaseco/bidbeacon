DROP INDEX "ams_budget_usage_advertiser_marketplace_budget_scope_timestamp_idx";--> statement-breakpoint
DROP INDEX "ams_cm_adgroups_ad_group_id_campaign_id_idx";--> statement-breakpoint
DROP INDEX "ams_cm_ads_ad_id_idx";--> statement-breakpoint
DROP INDEX "ams_cm_campaigns_campaign_id_idx";--> statement-breakpoint
DROP INDEX "ams_cm_targets_target_id_idx";--> statement-breakpoint
DROP INDEX "ams_sp_conversion_idempotency_id_idx";--> statement-breakpoint
DROP INDEX "ams_sp_traffic_idempotency_id_idx";--> statement-breakpoint
DROP INDEX "performance_pk_idx";--> statement-breakpoint
DROP INDEX "report_dataset_metadata_pk_idx";--> statement-breakpoint
ALTER TABLE "ams_budget_usage" ADD CONSTRAINT "ams_budget_usage_advertiser_id_marketplace_id_budget_scope_id_usage_updated_timestamp_pk" PRIMARY KEY("advertiser_id","marketplace_id","budget_scope_id","usage_updated_timestamp");--> statement-breakpoint
ALTER TABLE "ams_cm_adgroups" ADD CONSTRAINT "ams_cm_adgroups_ad_group_id_campaign_id_pk" PRIMARY KEY("ad_group_id","campaign_id");--> statement-breakpoint
ALTER TABLE "ams_cm_ads" ADD CONSTRAINT "ams_cm_ads_ad_id_pk" PRIMARY KEY("ad_id");--> statement-breakpoint
ALTER TABLE "ams_cm_campaigns" ADD CONSTRAINT "ams_cm_campaigns_campaign_id_pk" PRIMARY KEY("campaign_id");--> statement-breakpoint
ALTER TABLE "ams_cm_targets" ADD CONSTRAINT "ams_cm_targets_target_id_pk" PRIMARY KEY("target_id");--> statement-breakpoint
ALTER TABLE "ams_sp_conversion" ADD CONSTRAINT "ams_sp_conversion_idempotency_id_pk" PRIMARY KEY("idempotency_id");--> statement-breakpoint
ALTER TABLE "ams_sp_traffic" ADD CONSTRAINT "ams_sp_traffic_idempotency_id_pk" PRIMARY KEY("idempotency_id");--> statement-breakpoint
ALTER TABLE "performance" ADD CONSTRAINT "performance_account_id_date_aggregation_ad_id_target_id_pk" PRIMARY KEY("account_id","date","aggregation","ad_id","target_id");--> statement-breakpoint
ALTER TABLE "report_dataset_metadata" ADD CONSTRAINT "report_dataset_metadata_account_id_timestamp_aggregation_pk" PRIMARY KEY("account_id","timestamp","aggregation");