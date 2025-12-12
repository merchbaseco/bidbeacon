ALTER TABLE "advertiser_profile" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "advertiser_profile" CASCADE;--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'advertiser_account'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "advertiser_account" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "advertiser_account" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "advertiser_account" ADD COLUMN "country_code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "advertiser_account" ADD COLUMN "profile_id" integer;--> statement-breakpoint
ALTER TABLE "advertiser_account" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "advertiser_account" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "advertiser_account_unique_idx" ON "advertiser_account" USING btree ("ads_account_id","country_code","profile_id","entity_id");--> statement-breakpoint
CREATE INDEX "advertiser_account_ads_account_id_idx" ON "advertiser_account" USING btree ("ads_account_id");--> statement-breakpoint
ALTER TABLE "advertiser_account" DROP COLUMN "alternate_ids";--> statement-breakpoint
ALTER TABLE "advertiser_account" DROP COLUMN "country_codes";