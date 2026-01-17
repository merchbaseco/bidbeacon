CREATE TABLE "user_account_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"ads_account_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_account_access_user_account_idx" ON "user_account_access" USING btree ("clerk_user_id","ads_account_id");--> statement-breakpoint
CREATE INDEX "user_account_access_user_idx" ON "user_account_access" USING btree ("clerk_user_id");