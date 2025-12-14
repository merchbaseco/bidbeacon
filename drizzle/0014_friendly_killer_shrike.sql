-- Drop NOT NULL constraint first, then update values to null
ALTER TABLE "report_dataset_metadata" ALTER COLUMN "report_id" DROP NOT NULL;--> statement-breakpoint
UPDATE "report_dataset_metadata" SET "report_id" = NULL WHERE "report_id" IS NOT NULL;