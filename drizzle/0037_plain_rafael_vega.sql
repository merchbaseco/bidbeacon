CREATE TABLE "job_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"job_name" text NOT NULL,
	"boss_job_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"event_type" text NOT NULL,
	"headline" text NOT NULL,
	"detail" text,
	"stage" text,
	"status" text,
	"duration_ms" integer,
	"row_count" integer,
	"retry_count" integer,
	"api_name" text,
	"account_id" text,
	"country_code" text,
	"dataset_id" text,
	"entity_type" text,
	"aggregation" text,
	"bucket_date" date,
	"bucket_start" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "job_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"boss_job_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"error_code" text,
	"error_message" text,
	"account_id" text,
	"country_code" text,
	"dataset_id" text,
	"entity_type" text,
	"aggregation" text,
	"bucket_date" date,
	"bucket_start" timestamp with time zone,
	"records_processed" integer,
	"records_failed" integer,
	"metadata" jsonb
);
--> statement-breakpoint
DROP TABLE "job_metrics" CASCADE;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_session_id_job_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."job_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_events_session_occurred_idx" ON "job_events" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "job_events_job_name_occurred_idx" ON "job_events" USING btree ("job_name","occurred_at");--> statement-breakpoint
CREATE INDEX "job_events_account_occurred_idx" ON "job_events" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "job_sessions_job_name_started_idx" ON "job_sessions" USING btree ("job_name","started_at");--> statement-breakpoint
CREATE INDEX "job_sessions_account_started_idx" ON "job_sessions" USING btree ("account_id","started_at");