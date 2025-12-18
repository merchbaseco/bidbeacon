CREATE TABLE "job_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"success" boolean NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"error" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE INDEX "job_metrics_job_name_end_time_idx" ON "job_metrics" USING btree ("job_name","end_time");--> statement-breakpoint
CREATE INDEX "job_metrics_end_time_idx" ON "job_metrics" USING btree ("end_time");