CREATE TABLE "ams_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"entity_type" text NOT NULL,
	"success" boolean NOT NULL,
	"duration_ms" integer NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "ams_metrics_timestamp_idx" ON "ams_metrics" USING btree ("timestamp");