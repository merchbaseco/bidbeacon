CREATE TABLE "access_projection" (
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"state" text NOT NULL,
	"merchbase_user_id" text,
	"access" text,
	"access_valid_until" bigint,
	"source_updated_at" bigint NOT NULL,
	"last_event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_projection_issuer_subject_pk" PRIMARY KEY("issuer","subject")
);
--> statement-breakpoint
CREATE TABLE "access_projection_event" (
	"event_id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"source_updated_at" bigint NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_key_account_access" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "api_key" CASCADE;--> statement-breakpoint
DROP TABLE "api_key_account_access" CASCADE;--> statement-breakpoint
ALTER TABLE "user_account_access" RENAME COLUMN "clerk_user_id" TO "merchbase_user_id";--> statement-breakpoint
ALTER TABLE "user_preferences" RENAME COLUMN "clerk_user_id" TO "merchbase_user_id";--> statement-breakpoint
DROP INDEX "user_account_access_user_account_idx";--> statement-breakpoint
DROP INDEX "user_account_access_user_idx";--> statement-breakpoint
CREATE INDEX "access_projection_merchbase_user_idx" ON "access_projection" USING btree ("merchbase_user_id","source_updated_at");--> statement-breakpoint
CREATE INDEX "access_projection_event_identity_idx" ON "access_projection_event" USING btree ("issuer","subject","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_account_access_user_account_idx" ON "user_account_access" USING btree ("merchbase_user_id","ads_account_id");--> statement-breakpoint
CREATE INDEX "user_account_access_user_idx" ON "user_account_access" USING btree ("merchbase_user_id");