DELETE FROM "api_key" WHERE "revoked_at" IS NOT NULL;--> statement-breakpoint
DROP INDEX "api_key_revoked_at_idx";--> statement-breakpoint
ALTER TABLE "api_key" DROP COLUMN "revoked_at";
