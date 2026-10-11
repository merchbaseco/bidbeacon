DELETE FROM "worker_control" AS older
USING "worker_control" AS newer
WHERE older.id = newer.id
  AND (
    older.updated_at < newer.updated_at
    OR (older.updated_at = newer.updated_at AND older.ctid < newer.ctid)
  );--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.worker_control'::regclass
          AND contype = 'p'
    ) THEN
        ALTER TABLE "worker_control" ADD CONSTRAINT "worker_control_pkey" PRIMARY KEY ("id");
    END IF;
END $$;
