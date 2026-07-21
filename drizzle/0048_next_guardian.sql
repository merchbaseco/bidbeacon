CREATE TABLE "api_rate_limit_state" (
	"key" text PRIMARY KEY NOT NULL,
	"cooldown_until" timestamp with time zone NOT NULL,
	"last_rate_limit_at" timestamp with time zone NOT NULL,
	"last_retry_after_ms" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE IF EXISTS "report_dataset_metrics" CASCADE;--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_job_metric_id_job_metrics_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_perf_hourly_local";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_job_metric_id_job_metrics_id_fk" FOREIGN KEY ("job_metric_id") REFERENCES "public"."job_metrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ams_sp_conversion_time_window_start_idx" ON "ams_sp_conversion" USING btree ("time_window_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ams_sp_traffic_time_window_start_idx" ON "ams_sp_traffic" USING btree ("time_window_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_job_metric_idx" ON "events" USING btree ("job_metric_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_metrics_finished_idx" ON "job_metrics" USING btree ("finished_at");--> statement-breakpoint
ALTER TABLE "performance_hourly" SET (
	autovacuum_vacuum_scale_factor = 0.02,
	autovacuum_analyze_scale_factor = 0.02,
	autovacuum_vacuum_threshold = 1000,
	autovacuum_analyze_threshold = 1000
);--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
