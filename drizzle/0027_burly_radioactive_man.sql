ALTER TABLE "report_dataset_metadata" ADD COLUMN "next_refresh_at" timestamp;--> statement-breakpoint
ALTER TABLE "report_dataset_metadata" DROP COLUMN "last_refreshed";--> statement-breakpoint
-- Calculate next_refresh_at for existing rows based on eligibility logic
-- Daily reports: eligible at T-1, T-3, T-5, T-7, T-14, T-30, T-60 days (24, 72, 120, 168, 336, 720, 1440 hours)
-- Hourly reports: eligible at T-24, T-72, T-312 hours
-- For each row, find the next eligible offset that either hasn't been reached yet OR has been reached but no report was created at that offset
UPDATE "report_dataset_metadata" SET "next_refresh_at" = (
    CASE 
        WHEN "aggregation" = 'daily' THEN
            -- Daily: find next eligible offset (24, 72, 120, 168, 336, 720, 1440 hours)
            CASE
                -- If age < 24 hours, next refresh is at timestamp + 24 hours
                WHEN EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 < 24 THEN
                    "timestamp" + INTERVAL '24 hours'
                -- If age >= 24 but < 72 hours and (no report created OR report created before 24 hour threshold)
                WHEN EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 >= 24 
                     AND EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 < 72
                     AND ("last_report_created_at" IS NULL OR EXTRACT(EPOCH FROM ("last_report_created_at" - "timestamp")) / 3600 < 24) THEN
                    "timestamp" + INTERVAL '24 hours'
                WHEN EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 >= 72 
                     AND EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 < 120
                     AND ("last_report_created_at" IS NULL OR EXTRACT(EPOCH FROM ("last_report_created_at" - "timestamp")) / 3600 < 72) THEN
                    "timestamp" + INTERVAL '72 hours'
                WHEN EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 >= 120 
                     AND EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 < 168
                     AND ("last_report_created_at" IS NULL OR EXTRACT(EPOCH FROM ("last_report_created_at" - "timestamp")) / 3600 < 120) THEN
                    "timestamp" + INTERVAL '120 hours'
                WHEN EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 >= 168 
                     AND EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 < 336
                     AND ("last_report_created_at" IS NULL OR EXTRACT(EPOCH FROM ("last_report_created_at" - "timestamp")) / 3600 < 168) THEN
                    "timestamp" + INTERVAL '168 hours'
                WHEN EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 >= 336 
                     AND EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 < 720
                     AND ("last_report_created_at" IS NULL OR EXTRACT(EPOCH FROM ("last_report_created_at" - "timestamp")) / 3600 < 336) THEN
                    "timestamp" + INTERVAL '336 hours'
                WHEN EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 >= 720 
                     AND EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 < 1440
                     AND ("last_report_created_at" IS NULL OR EXTRACT(EPOCH FROM ("last_report_created_at" - "timestamp")) / 3600 < 720) THEN
                    "timestamp" + INTERVAL '720 hours'
                WHEN EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 >= 1440
                     AND ("last_report_created_at" IS NULL OR EXTRACT(EPOCH FROM ("last_report_created_at" - "timestamp")) / 3600 < 1440) THEN
                    "timestamp" + INTERVAL '1440 hours'
                -- All offsets reached and reports created - set to NULL (no more refreshes)
                ELSE NULL
            END
        WHEN "aggregation" = 'hourly' THEN
            -- Hourly: find next eligible offset (24, 72, 312 hours)
            CASE
                -- If age < 24 hours, next refresh is at timestamp + 24 hours
                WHEN EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 < 24 THEN
                    "timestamp" + INTERVAL '24 hours'
                -- If age >= 24 but < 72 hours and (no report created OR report created before 24 hour threshold)
                WHEN EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 >= 24 
                     AND EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 < 72
                     AND ("last_report_created_at" IS NULL OR EXTRACT(EPOCH FROM ("last_report_created_at" - "timestamp")) / 3600 < 24) THEN
                    "timestamp" + INTERVAL '24 hours'
                WHEN EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 >= 72 
                     AND EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 < 312
                     AND ("last_report_created_at" IS NULL OR EXTRACT(EPOCH FROM ("last_report_created_at" - "timestamp")) / 3600 < 72) THEN
                    "timestamp" + INTERVAL '72 hours'
                WHEN EXTRACT(EPOCH FROM (NOW() - "timestamp")) / 3600 >= 312
                     AND ("last_report_created_at" IS NULL OR EXTRACT(EPOCH FROM ("last_report_created_at" - "timestamp")) / 3600 < 312) THEN
                    "timestamp" + INTERVAL '312 hours'
                -- All offsets reached and reports created - set to NULL (no more refreshes)
                ELSE NULL
            END
        ELSE NULL
    END
);