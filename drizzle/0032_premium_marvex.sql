ALTER TABLE "report_dataset_metadata" ADD COLUMN "total_records" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "report_dataset_metadata" ADD COLUMN "processed_records" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "report_dataset_metadata" ADD COLUMN "error_records" integer DEFAULT 0 NOT NULL;