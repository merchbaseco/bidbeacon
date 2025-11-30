CREATE TABLE "worker_control" (
	"id" text PRIMARY KEY DEFAULT 'main' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
