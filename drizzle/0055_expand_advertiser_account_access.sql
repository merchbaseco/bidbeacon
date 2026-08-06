-- Custom SQL migration file, put your code below! --
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "user_account_access" membership
        WHERE membership."advertiser_account_id" IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM "advertiser_account" account
              WHERE account."ads_account_id" = membership."ads_account_id"
          )
    ) THEN
        RAISE EXCEPTION 'Cannot expand user account access: a legacy membership has no advertiser account match.';
    END IF;
END $$;
--> statement-breakpoint
INSERT INTO "user_account_access" ("merchbase_user_id", "ads_account_id", "advertiser_account_id", "created_at")
SELECT membership."merchbase_user_id", membership."ads_account_id", account."id", membership."created_at"
FROM "user_account_access" membership
INNER JOIN "advertiser_account" account ON account."ads_account_id" = membership."ads_account_id"
WHERE membership."advertiser_account_id" IS NULL
ON CONFLICT ("merchbase_user_id", "advertiser_account_id") DO NOTHING;
--> statement-breakpoint
DELETE FROM "user_account_access"
WHERE "advertiser_account_id" IS NULL;
