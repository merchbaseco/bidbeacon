CREATE TABLE "api_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_name" text NOT NULL,
	"region" text NOT NULL,
	"status_code" integer,
	"success" boolean NOT NULL,
	"duration_ms" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "api_metrics_api_name_timestamp_idx" ON "api_metrics" USING btree ("api_name","timestamp");--> statement-breakpoint
CREATE INDEX "api_metrics_timestamp_idx" ON "api_metrics" USING btree ("timestamp");