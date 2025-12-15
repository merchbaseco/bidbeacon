CREATE TABLE "account_dataset_metadata" (
	"account_id" text NOT NULL,
	"country_code" text NOT NULL,
	"status" text NOT NULL,
	"last_sync_started" timestamp,
	"last_sync_completed" timestamp,
	"campaigns_count" integer,
	"ad_groups_count" integer,
	"ads_count" integer,
	"targets_count" integer,
	"error" text,
	CONSTRAINT "account_dataset_metadata_account_id_country_code_pk" PRIMARY KEY("account_id","country_code")
);
