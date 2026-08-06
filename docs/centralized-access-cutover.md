---
summary: Approval-gated production procedure for the BidBeacon Merchbase Access migration and deleted-subject cleanup.
read_when:
  - changing BidBeacon authentication or membership ownership
  - preparing the centralized Merchbase Access cutover
  - changing the server/worker production maintenance procedure
---

# Centralized Merchbase Access cutover

This cutover completed in production on August 3, 2026, at
`cd1128f831012cb1327144a3cf3f5b12e1e2bbe9`. The procedure below is retained as
the acceptance and rollback record; do not rerun it as a routine deployment.
Any future production migration, backfill, or rollback still requires explicit
operator approval and a named database owner.

The target state has one authentication contract: the shared `@merchbaseco/access` package with fixed service `bidbeacon`. BidBeacon accepts Clerk web sessions, suite `ak_...` API keys, and the shared OAuth credential path. Authorization resolves a stable `mbu_...` Merchbase User through the product-local `user_account_access` projection. The old `bbk_` issuer/verifier, header, routes, UI, environment variable, and tables do not exist after cutover.

## Advertiser Account UUID projection

The PRD-173 access projection makes `user_account_access.advertiser_account_id` the canonical membership target. Migration `0055_expand_advertiser_account_access` expands each legacy `ads_account_id` membership to every matching marketplace-specific row in `advertiser_account`, then migration `0056_flat_tarantula` makes the UUID non-null. This preserves access across profiles without granting unrelated Amazon accounts; an orphaned legacy membership fails closed.

`user_account_access.ads_account_id` remains a temporary bridge for legacy dashboard and adapter code through the PRD-185 public-contract cutover. Shared operation principals expose Advertiser Account UUIDs for authorization and retain Amazon IDs only for that bridge. Account sync propagates newly discovered marketplace profiles to every stable user already linked through that Amazon ID plus the syncing user. The operation layer never reads `user_preferences`: dashboard account selection remains a UI preference, not an authorization input.

The counts and exact retained membership row IDs in the historical procedure below describe the August 3 centralized-access cleanup before this follow-on projection expansion. Do not use those historical counts as the PRD-173 post-migration inventory; verify the UUID memberships produced by the expansion instead.

This cutover uses one explicit cleanup, not identity relinking: the deleted Clerk subject has exactly three duplicate membership rows, while the retained subject has the four effective memberships, one preference, the one legacy key, and all four former key scopes. Do not add a second stable-user mapping, infer identity from email, merge workspaces, or invent an account hierarchy.

## Approval gates

Do not proceed past a gate until the check is recorded in the change ticket.

1. **Read-only preflight approved.** Confirm exactly 11 `advertiser_account` rows, 4 distinct `ads_account_id` values, 7 membership rows across 2 Clerk subjects, one legacy key with 4 key-access rows, one preference row, and complete account coverage.
2. **Explicit cleanup approved.** Confirm the retained subject's Clerk public metadata maps to the retained stable user, the retired subject returns Clerk 404, and the private audit contains the exact three retired membership row IDs and their account IDs. Confirm every retired account is present on one of the four retained rows; confirm the retired subject owns no preference, key, or key scope.
3. **Plan approved.** Run the read-only planner against the access-controlled private audit and record its digest plus source/target counts. The planner must produce four retained membership mappings to the audited stable user and three exact retired row IDs.
4. **Recovery approved.** A verified database backup/snapshot and restore owner exist. Because the generated migration drops the product-local key tables, an application rollback alone is not safe.
5. **Maintenance approved.** Pause the self-hosted runner and any push-to-main deployment automation. Manually stop Caddy, server, and worker; do not use the existing workflow as the migration executor. Set `DISABLE_SERVER_JOB_RUNNER=true` only while starting the new server for migration/backfill; keep normal traffic closed.
6. **Central auth approved.** The Clerk webhook is configured for `/api/webhooks/clerk/access` with its signing secret, Account Center has a suite key for the retained stable user, and the CLI/API-client credential convention is communicated to operators.

## Read-only preflight and private audit

Run the existing documented read-only queries in `docs/database-queries.md`, plus these shape checks. Use the production connection only after Gate 1 approval.

```sql
SELECT count(*) AS advertiser_account_rows,
       count(DISTINCT ads_account_id) AS advertiser_account_ids
FROM advertiser_account;

SELECT count(*) AS membership_rows,
       count(DISTINCT clerk_user_id) AS clerk_subjects
FROM user_account_access;

SELECT count(*) AS legacy_keys FROM api_key;
SELECT count(*) AS legacy_key_access_rows FROM api_key_account_access;
SELECT count(*) AS preference_rows FROM user_preferences;

SELECT count(*) AS accounts_without_membership
FROM advertiser_account account
WHERE NOT EXISTS (
  SELECT 1 FROM user_account_access membership
  WHERE membership.ads_account_id = account.ads_account_id
);
```

The private, access-controlled JSON audit must contain only IDs, ownership evidence, and preference values—never `api_key.secret_hash`, raw credentials, or a production connection string. Its cleanup section must contain the exact three retired row IDs and account IDs from the approved operator audit; do not copy those values into this repository, substitute IDs, or run with placeholders. The operator record and private audit are the source of truth for the exact values.

| retired membership row ID | `ads_account_id` |
| --- | --- |
| `<retired-membership-row-id-1>` | `<retired-ads-account-id-1>` |
| `<retired-membership-row-id-2>` | `<retired-ads-account-id-2>` |
| `<retired-membership-row-id-3>` | `<retired-ads-account-id-3>` |

The audit also records the retained/retired Clerk subjects, the retained stable-user ID, `clerkLookupStatus: "not_found"`, `stableUserResolution: "clerk_public_metadata"`, zero retired preference/key/key-scope ownership, all seven membership rows, the one key's ID and owner, the four key scopes and owners, and the one preference's values. The exact IDs are input evidence; shipped planner code validates the explicit shape and does not embed customer identifiers.

Example shape (fill from the private audit; do not use placeholders when running it):

```json
{
  "advertiserAccountCount": 11,
  "advertiserAccountIds": ["...four distinct ads_account_id values..."],
  "memberships": [
    {"id": "...", "adsAccountId": "...", "clerkUserId": "..."}
  ],
  "preferences": [
    {"clerkUserId": "...retained subject...", "selectedAdsAccountId": "...", "selectedProfileId": "..."}
  ],
  "legacyKeys": [{"id": "...", "clerkUserId": "...retained subject..."}],
  "legacyKeyCount": 1,
  "legacyKeyAccessRowCount": 4,
  "legacyKeyAccessRows": [
    {"adsAccountId": "...", "clerkUserId": "...retained subject..."}
  ],
  "tombstonedSubjectCleanup": {
    "cleanupKind": "deleted_subject_duplicate_memberships",
    "clerkLookupStatus": "not_found",
    "stableUserResolution": "clerk_public_metadata",
    "retiredClerkUserId": "...deleted subject...",
    "retainedClerkUserId": "...active subject...",
    "retainedMerchbaseUserId": "...stable user...",
    "retiredMembershipIds": [
      "<retired-membership-row-id-1>",
      "<retired-membership-row-id-2>",
      "<retired-membership-row-id-3>"
    ],
    "retiredPreferenceCount": 0,
    "retiredLegacyKeyCount": 0,
    "retiredLegacyKeyAccessRowCount": 0
  }
}
```

Run the planner locally:

```bash
bun run access:plan -- --input ./private/bidbeacon-access-audit.json
```

The planner is read-only and fails closed on a changed source inventory, a non-tombstoned or differently shaped cleanup, missing/duplicate retired row IDs, a non-duplicate retired membership, missing account coverage, a retained-row collision, any retired preference/key ownership, legacy key-scope drift, or a preference/key count change. Save the complete output, including `planDigest`, `sourceCounts`, `targetCounts`, `retiredMembershipIds`, and the four retained mappings, with the change record.

The worker uses the same account boundary explicitly: for direct AMS datasets it looks up the payload's `advertiser_id` (with its required `marketplace_id`) against `advertiser_account.entity_id` and accepts only one distinct `ads_account_id`; duplicate profile rows for that account are harmless, while none, null, or multiple distinct account IDs fail closed. Campaign-management campaigns, ad groups, targets, and ads resolve through existing canonical campaign/ad-group ownership; an unresolved or conflicting entity remains queued and never reaches a handler.

## Schema, exact cleanup, and read-after-write checks

1. From a clean review of `src/db/schema.ts`, generate the migration with `bun run db:generate`. Never hand-edit generated SQL. The current generated migration creates the Access Projection/event tables, renames the membership and preference ownership columns, and drops the legacy local key tables.
2. With Caddy, server, and worker stopped and the self-hosted runner paused, take the approved snapshot. Build the reviewed image manually. Start the new server with `DISABLE_SERVER_JOB_RUNNER=true`; its normal unset/`false` behavior remains enabled, but maintenance must explicitly set `true`. Do not expose it to public traffic.
3. Let the normal server startup migrator finish. In one reviewed transaction, load the same private audit and planner digest into a temporary table. Delete only the three exact retired `user_account_access` row IDs. Update only the four retained membership rows and the one retained preference owner to the audited stable user. Abort on any row-ID, subject, account, preference, or unique-key mismatch; never repair a mismatch by deleting another row.
4. The transaction must not delete or rewrite any `advertiser_account`, product, provider, AMS, report, metric, job, event, or other application data. The old local key is retired by the generated clean-break schema; preserve its four former scopes as four stable-user membership scopes before and after the cutover.
5. Before opening traffic, run read-after-write checks:

   - 11 `advertiser_account` rows and the same four distinct `ads_account_id` values remain.
   - Exactly four `user_account_access` rows remain, with the exact retained row IDs and the audited `mbu_...` value; the exact three retired row IDs are absent.
   - Every one of the four distinct advertiser account IDs, and therefore all 11 advertiser-account rows, still has membership coverage.
   - Exactly one preference row remains, owned by the stable user, with both selected values unchanged.
   - All four former legacy key scopes resolve to the stable user's memberships; no raw key is recreated and no `user_...` ownership value remains.
   - Row counts and key-ID/row-ID inventories for product/provider/reporting data are unchanged. Compare the approved preflight inventory with `campaign`, `ad_group`, `ad`, `target`, `advertiser_account`, `account_dataset_metadata`, `report_dataset_metadata`, `performance_*`, `ams_*`, `entity_change_history`, `change_history_sync_state`, `api_metrics`, `api_rate_limit_state`, `job_metrics`, and `events`; do not accept a count-only result if a keyed row inventory differs.

6. Configure the signed Clerk webhook and send a replay-safe test event. Confirm a projection row is written, a duplicate event is idempotent, an older event cannot overwrite a newer `source_updated_at`, and the identity update invalidates the bounded opaque-key cache.
7. Perform read-after-write smoke tests with a Clerk web session, one suite API key, and one OAuth credential. Verify the retained stable user sees the expected M:N accounts, a denied/expired projection is rejected, and an account with no current member skips future background work without deleting queued or product data. Verify AMS messages resolve their advertiser account before handlers; allowed messages process and delete, denied/unavailable/unknown messages remain queued.
8. Test realtime through `POST /api/events/ticket` followed by a WebSocket connection using `Sec-WebSocket-Protocol`. Confirm there is no credential in the URL, the ticket is accepted once, and an expired/replayed ticket is rejected.
9. Only after all checks pass, set `DISABLE_SERVER_JOB_RUNNER` to false or unset it, start the normal server and worker, reopen Caddy, then resume the paused self-hosted runner/automation. Monitor projection webhook responses, access-gate skips, AMS access-gate retries, job metrics, and account access for the first full refresh interval.

The existing push-to-main workflow is deployment automation, not the migration executor. It must remain paused throughout the manual stop/snapshot/build/migrate/backfill/verify sequence. Resume it only after the operator has approved the read-after-write checks and normal traffic is open.

## Rollback

This is a clean break with no dual-auth window or compatibility alias.

- If the migration has not started, stop and fix the audit, plan, or release procedure; no rollback is needed.
- If the generated migration has started or completed, stop all new server/worker traffic and pause the self-hosted runner again. Do not point the old application at the migrated schema and do not manually recreate the dropped key tables.
- With explicit approval, restore the verified pre-cutover database snapshot and start the old application image in maintenance. Confirm the original 11/7/2/1/4 inventory, the exact three retired rows, preferences, key scopes, and product/provider/reporting inventories before reopening traffic.
- If the snapshot cannot be restored, remain in maintenance and escalate to the database owner. Do not reconstruct memberships, preferences, or credentials from memory and do not delete product data to force the old schema to fit.
- After a successful rollback, invalidate any central key issued for the failed cutover, record the Clerk webhook delivery state for replay after the next approved attempt, and resume automation only after the operator approves the restored read-after-write checks.
