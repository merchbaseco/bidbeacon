ALTER TABLE "advertiser_profile" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "advertiser_profile" CASCADE;--> statement-breakpoint
-- Clear existing data from advertiser_account table
TRUNCATE TABLE "advertiser_account";--> statement-breakpoint
-- Drop the existing primary key constraint on ads_account_id
ALTER TABLE "advertiser_account" DROP CONSTRAINT "advertiser_account_pkey";--> statement-breakpoint
-- Add the new id column as primary key
ALTER TABLE "advertiser_account" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
-- Make ads_account_id NOT NULL
ALTER TABLE "advertiser_account" ALTER COLUMN "ads_account_id" SET NOT NULL;--> statement-breakpoint
-- Add new columns
ALTER TABLE "advertiser_account" ADD COLUMN "country_code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "advertiser_account" ADD COLUMN "profile_id" integer;--> statement-breakpoint
ALTER TABLE "advertiser_account" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "advertiser_account" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Create indexes
CREATE UNIQUE INDEX "advertiser_account_unique_idx" ON "advertiser_account" USING btree ("ads_account_id","country_code","profile_id","entity_id");--> statement-breakpoint
CREATE INDEX "advertiser_account_ads_account_id_idx" ON "advertiser_account" USING btree ("ads_account_id");--> statement-breakpoint
-- Drop old columns
ALTER TABLE "advertiser_account" DROP COLUMN "alternate_ids";--> statement-breakpoint
ALTER TABLE "advertiser_account" DROP COLUMN "country_codes";