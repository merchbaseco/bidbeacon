ALTER TABLE "ams_sp_conversion" ADD COLUMN "received_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ams_sp_traffic" ADD COLUMN "received_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "ams_sp_conversion_advertiser_received_idx" ON "ams_sp_conversion" USING btree ("advertiser_id","received_at");--> statement-breakpoint
CREATE INDEX "ams_sp_traffic_advertiser_received_idx" ON "ams_sp_traffic" USING btree ("advertiser_id","received_at");