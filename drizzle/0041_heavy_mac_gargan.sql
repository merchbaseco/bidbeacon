CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_metric_id" uuid NOT NULL,
	"job_name" text NOT NULL,
	"account_id" text,
	"country_code" text,
	"outcome" text NOT NULL,
	"message" text,
	"badges" jsonb,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"boss_job_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"input" jsonb
);
--> statement-breakpoint
DROP TABLE "job_sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_job_metric_id_job_metrics_id_fk" FOREIGN KEY ("job_metric_id") REFERENCES "public"."job_metrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_account_created_idx" ON "events" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "events_job_name_created_idx" ON "events" USING btree ("job_name","created_at");--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "job_metrics_job_name_started_idx" ON "job_metrics" USING btree ("job_name","started_at");