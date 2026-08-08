CREATE TABLE "product_metadata" (
	"country_code" text NOT NULL,
	"asin" text NOT NULL,
	"title" text,
	"last_synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "product_metadata_country_code_asin_pk" PRIMARY KEY("country_code","asin")
);
--> statement-breakpoint
ALTER TABLE "api_metrics" ADD COLUMN "item_count" integer;--> statement-breakpoint
CREATE INDEX "product_metadata_asin_idx" ON "product_metadata" USING btree ("asin");