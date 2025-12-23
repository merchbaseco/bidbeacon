CREATE TABLE "report_dataset_metrics" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_dataset_metadata_id" uuid NOT NULL,
	"row" jsonb NOT NULL,
	"error" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_dataset_metrics" ADD CONSTRAINT "report_dataset_metrics_report_dataset_metadata_id_report_dataset_metadata_uid_fk" FOREIGN KEY ("report_dataset_metadata_id") REFERENCES "public"."report_dataset_metadata"("uid") ON DELETE no action ON UPDATE no action;