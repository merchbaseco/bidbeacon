ALTER TABLE "performance_annual" RENAME COLUMN "orders_14d" TO "orders";--> statement-breakpoint
ALTER TABLE "performance_daily" RENAME COLUMN "orders_14d" TO "orders";--> statement-breakpoint
ALTER TABLE "performance_hourly" RENAME COLUMN "orders_14d" TO "orders";--> statement-breakpoint
ALTER TABLE "performance_monthly" RENAME COLUMN "orders_14d" TO "orders";