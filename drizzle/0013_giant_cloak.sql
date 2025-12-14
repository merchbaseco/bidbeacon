-- Add country_code column as nullable first
ALTER TABLE "report_dataset_metadata" ADD COLUMN "country_code" text;--> statement-breakpoint
-- Update all existing rows to have country_code = 'us'
UPDATE "report_dataset_metadata" SET "country_code" = 'us' WHERE "country_code" IS NULL;--> statement-breakpoint
-- Now make the column NOT NULL
ALTER TABLE "report_dataset_metadata" ALTER COLUMN "country_code" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "advertiser_account_ads_account_id_profile_id_idx" ON "advertiser_account" USING btree ("ads_account_id","profile_id");