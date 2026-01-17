CREATE TABLE "user_preferences" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"selected_ads_account_id" text,
	"selected_profile_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
