ALTER TABLE "api_metrics" ADD COLUMN "attempt_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "api_metrics" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "api_metrics" ADD COLUMN "rate_limit_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "api_metrics" ADD COLUMN "retry_after_ms" integer;--> statement-breakpoint
ALTER TABLE "api_metrics" ADD COLUMN "queue_wait_ms" integer DEFAULT 0 NOT NULL;