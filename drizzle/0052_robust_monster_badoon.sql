ALTER TABLE "api_metrics" RENAME COLUMN "retry_after_ms" TO "governor_cooldown_ms";--> statement-breakpoint
ALTER TABLE "api_rate_limit_state" RENAME COLUMN "last_retry_after_ms" TO "last_governor_cooldown_ms";--> statement-breakpoint
ALTER TABLE "api_metrics" ADD COLUMN "amazon_retry_after_ms" integer;--> statement-breakpoint
ALTER TABLE "api_metrics" ADD COLUMN "rate_limit_request_id" text;--> statement-breakpoint
ALTER TABLE "api_metrics" ADD COLUMN "rate_limit_response_content_type" text;--> statement-breakpoint
ALTER TABLE "api_metrics" ADD COLUMN "rate_limit_response_server" text;--> statement-breakpoint
ALTER TABLE "api_rate_limit_state" DROP COLUMN "exhaustion_count";--> statement-breakpoint
ALTER TABLE "api_rate_limit_state" DROP COLUMN "recovery_probes_remaining";