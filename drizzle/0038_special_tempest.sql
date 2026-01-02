ALTER TABLE "job_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "job_events" CASCADE;--> statement-breakpoint
DROP INDEX "job_sessions_account_started_idx";--> statement-breakpoint
ALTER TABLE "job_sessions" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "job_sessions" ADD COLUMN "input" jsonb;--> statement-breakpoint
ALTER TABLE "job_sessions" ADD COLUMN "actions" jsonb;--> statement-breakpoint
ALTER TABLE "job_sessions" DROP COLUMN "duration_ms";--> statement-breakpoint
ALTER TABLE "job_sessions" DROP COLUMN "error_code";--> statement-breakpoint
ALTER TABLE "job_sessions" DROP COLUMN "error_message";--> statement-breakpoint
ALTER TABLE "job_sessions" DROP COLUMN "account_id";--> statement-breakpoint
ALTER TABLE "job_sessions" DROP COLUMN "country_code";--> statement-breakpoint
ALTER TABLE "job_sessions" DROP COLUMN "dataset_id";--> statement-breakpoint
ALTER TABLE "job_sessions" DROP COLUMN "entity_type";--> statement-breakpoint
ALTER TABLE "job_sessions" DROP COLUMN "aggregation";--> statement-breakpoint
ALTER TABLE "job_sessions" DROP COLUMN "bucket_date";--> statement-breakpoint
ALTER TABLE "job_sessions" DROP COLUMN "bucket_start";--> statement-breakpoint
ALTER TABLE "job_sessions" DROP COLUMN "records_processed";--> statement-breakpoint
ALTER TABLE "job_sessions" DROP COLUMN "records_failed";--> statement-breakpoint
ALTER TABLE "job_sessions" DROP COLUMN "metadata";