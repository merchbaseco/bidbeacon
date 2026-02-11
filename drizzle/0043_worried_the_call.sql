ALTER TABLE "performance_annual" RENAME COLUMN "orders" TO "purchases";--> statement-breakpoint
ALTER TABLE "performance_daily" RENAME COLUMN "orders" TO "purchases";--> statement-breakpoint
ALTER TABLE "performance_hourly" RENAME COLUMN "orders" TO "purchases";--> statement-breakpoint
ALTER TABLE "performance_monthly" RENAME COLUMN "orders" TO "purchases";