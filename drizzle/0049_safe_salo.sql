DELETE FROM "report_dataset_metadata" WHERE "aggregation" = 'hourly';--> statement-breakpoint
ALTER TABLE "report_dataset_metadata" ALTER COLUMN "period_start" SET DATA TYPE timestamp with time zone USING "period_start" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "report_dataset_metadata" ALTER COLUMN "next_refresh_at" SET DATA TYPE timestamp with time zone USING "next_refresh_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "report_dataset_metadata" ALTER COLUMN "last_report_created_at" SET DATA TYPE timestamp with time zone USING timezone(
	CASE "country_code"
		WHEN 'US' THEN 'America/Los_Angeles'
		WHEN 'MX' THEN 'America/Los_Angeles'
		WHEN 'CA' THEN 'America/Los_Angeles'
		WHEN 'DE' THEN 'Europe/London'
		WHEN 'ES' THEN 'Europe/London'
		WHEN 'FR' THEN 'Europe/London'
		WHEN 'IT' THEN 'Europe/London'
		WHEN 'GB' THEN 'Europe/London'
		WHEN 'JP' THEN 'Asia/Tokyo'
		ELSE 'UTC'
	END,
	"last_report_created_at"
);--> statement-breakpoint
CREATE INDEX "report_dataset_metadata_due_idx" ON "report_dataset_metadata" USING btree ("refreshing","next_refresh_at");
