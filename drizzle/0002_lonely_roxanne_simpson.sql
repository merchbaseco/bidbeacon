CREATE UNIQUE INDEX "ams_budget_usage_advertiser_marketplace_budget_scope_timestamp_idx" ON "ams_budget_usage" USING btree ("advertiser_id","marketplace_id","budget_scope_id","usage_updated_timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "ams_cm_adgroups_ad_group_id_campaign_id_idx" ON "ams_cm_adgroups" USING btree ("ad_group_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ams_cm_ads_ad_id_idx" ON "ams_cm_ads" USING btree ("ad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ams_cm_campaigns_campaign_id_version_idx" ON "ams_cm_campaigns" USING btree ("campaign_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ams_cm_targets_target_id_idx" ON "ams_cm_targets" USING btree ("target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ams_sp_conversion_idempotency_id_idx" ON "ams_sp_conversion" USING btree ("idempotency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ams_sp_traffic_idempotency_id_idx" ON "ams_sp_traffic" USING btree ("idempotency_id");