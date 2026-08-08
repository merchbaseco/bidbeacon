ALTER TABLE "performance_daily_placement" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "performance_daily_placement" CASCADE;--> statement-breakpoint
DROP INDEX "report_dataset_metadata_placement_unique_idx";--> statement-breakpoint
DROP INDEX "report_dataset_metadata_unique_idx";--> statement-breakpoint
DELETE FROM "report_dataset_metadata" WHERE "entity_type" = 'placement';--> statement-breakpoint
CREATE UNIQUE INDEX "report_dataset_metadata_unique_idx" ON "report_dataset_metadata" USING btree ("account_id","period_start","aggregation","entity_type");
