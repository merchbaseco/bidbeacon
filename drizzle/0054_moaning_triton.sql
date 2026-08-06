DROP INDEX "user_account_access_user_account_idx";--> statement-breakpoint
ALTER TABLE "user_account_access" ADD COLUMN "advertiser_account_id" uuid;--> statement-breakpoint
ALTER TABLE "user_account_access" ADD CONSTRAINT "user_account_access_advertiser_account_id_advertiser_account_id_fk" FOREIGN KEY ("advertiser_account_id") REFERENCES "public"."advertiser_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_account_access_ads_account_idx" ON "user_account_access" USING btree ("ads_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_account_access_user_account_idx" ON "user_account_access" USING btree ("merchbase_user_id","advertiser_account_id");