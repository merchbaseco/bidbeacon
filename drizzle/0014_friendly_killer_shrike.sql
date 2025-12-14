-- Set all existing report_id values to null
UPDATE "report_dataset_metadata" SET "report_id" = NULL;--> statement-breakpoint
ALTER TABLE "report_dataset_metadata" ALTER COLUMN "report_id" DROP NOT NULL;