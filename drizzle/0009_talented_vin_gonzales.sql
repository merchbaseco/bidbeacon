CREATE TABLE "advertiser_account" (
	"ads_account_id" text PRIMARY KEY NOT NULL,
	"account_name" text NOT NULL,
	"status" text NOT NULL,
	"alternate_ids" jsonb NOT NULL,
	"country_codes" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advertiser_profile" (
	"profile_id" bigint PRIMARY KEY NOT NULL,
	"country_code" text NOT NULL,
	"currency_code" text NOT NULL,
	"daily_budget" double precision,
	"timezone" text NOT NULL,
	"marketplace_string_id" text NOT NULL,
	"account_id" text NOT NULL,
	"account_type" text NOT NULL,
	"account_name" text NOT NULL,
	"valid_payment_method" boolean NOT NULL
);
