ALTER TABLE "account_dataset_metadata" ADD COLUMN "fetching_campaigns" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "account_dataset_metadata" ADD COLUMN "fetching_campaigns_poll_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "account_dataset_metadata" ADD COLUMN "fetching_ad_groups" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "account_dataset_metadata" ADD COLUMN "fetching_ad_groups_poll_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "account_dataset_metadata" ADD COLUMN "fetching_ads" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "account_dataset_metadata" ADD COLUMN "fetching_ads_poll_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "account_dataset_metadata" ADD COLUMN "fetching_targets" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "account_dataset_metadata" ADD COLUMN "fetching_targets_poll_count" integer DEFAULT 0;