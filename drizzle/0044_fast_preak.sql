CREATE TABLE "change_history_sync_state" (
	"account_id" text NOT NULL,
	"country_code" text NOT NULL,
	"local_date" date NOT NULL,
	"reconciled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_history_sync_state_account_id_country_code_local_date_pk" PRIMARY KEY("account_id","country_code","local_date")
);
--> statement-breakpoint
CREATE TABLE "entity_change_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"country_code" text,
	"local_date" date NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"event_type" text NOT NULL,
	"field_name" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"changed_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "entity_change_history_dedupe_idx" ON "entity_change_history" USING btree ("account_id","country_code","entity_type","entity_id","event_type","field_name","changed_at","new_value","source");--> statement-breakpoint
CREATE INDEX "entity_change_history_entity_time_idx" ON "entity_change_history" USING btree ("account_id","country_code","entity_type","entity_id","changed_at");--> statement-breakpoint
CREATE INDEX "entity_change_history_account_day_idx" ON "entity_change_history" USING btree ("account_id","country_code","local_date");