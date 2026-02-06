CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"secret_hash" text NOT NULL,
	"secret_suffix" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "api_key_account_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"ads_account_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key_account_access" ADD CONSTRAINT "api_key_account_access_api_key_id_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_created_by_idx" ON "api_key" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "api_key_revoked_at_idx" ON "api_key" USING btree ("revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_account_access_unique_idx" ON "api_key_account_access" USING btree ("api_key_id","ads_account_id");--> statement-breakpoint
CREATE INDEX "api_key_account_access_api_key_idx" ON "api_key_account_access" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "api_key_account_access_account_idx" ON "api_key_account_access" USING btree ("ads_account_id");