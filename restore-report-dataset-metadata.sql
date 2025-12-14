-- Restore report_dataset_metadata table
-- This recreates the table with all migrations applied

CREATE TABLE "report_dataset_metadata" (
    "account_id" text NOT NULL,
    "country_code" text NOT NULL,
    "timestamp" timestamp NOT NULL,
    "aggregation" text NOT NULL,
    "status" text NOT NULL,
    "last_refreshed" timestamp,
    "report_id" text NOT NULL,
    "error" text,
    CONSTRAINT "report_dataset_metadata_account_id_timestamp_aggregation_pk" 
        PRIMARY KEY("account_id","timestamp","aggregation")
);
