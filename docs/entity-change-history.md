# Entity Change History

BidBeacon stores optimization-impacting entity changes in a canonical table: `entity_change_history`.

## Canonical Table

Each row includes:
- `account_id`, `country_code`
- `entity_type` (`campaign`, `adGroup`, `ad`, `target`)
- `entity_id`
- `event_type` (`bid_change`, `state_change`, `budget_change`)
- `field_name` (for example `bidAmount`, `state`, `budgetAmount`)
- `previous_value`, `new_value`
- `changed_at` (UTC timestamp)
- `local_date` (account-local date derived from `country_code` timezone)
- `source` (`bidbeacon`, `ams`, `change_history`)
- `raw_payload` (optional)

Uniqueness/dedupe is country-aware: writes dedupe on `(account_id, country_code, entity_type, entity_id, event_type, field_name, changed_at, new_value, source)`.

## Supported History Records

Current normalization rules:
- Campaign:
  - `STATUS` -> `state_change` (`field_name = state`)
  - `BUDGET_AMOUNT` -> `budget_change` (`field_name = budgetAmount`)
- Ad group:
  - `STATUS` -> `state_change`
  - `BID_AMOUNT` / `DEFAULT_BID_AMOUNT` -> `bid_change`
- Ad:
  - `STATUS` -> `state_change`
- Target-like entities (keyword, product targeting, negative keyword):
  - `STATUS` -> `state_change`
  - `BID_AMOUNT` (where available) -> `bid_change`

## Write Paths

### BidBeacon-triggered writes (immediate)
- Public mutation helpers (`updateCampaignRow`, `updateAdGroupRow`, `updateAdRow`, `updateTargetRow`) write history rows with `source = 'bidbeacon'`.
- Shared ad-group and target bid mutation routers also write `bid_change` rows.

### AMS-triggered writes (sub-daily)
- Campaign/ad/ad-group/target handlers emit `state_change` rows.
- Ad-group and target handlers emit `bid_change` rows when AMS bid payloads change.

### Change History API writes (authoritative daily reconcile)
- `sync-change-history` (hourly scheduler) fans out account jobs.
- `sync-change-history-for-account` fetches Amazon Change History and reconciles by local day.
- Reconcile behavior for each local day:
  1. Delete existing rows for `(account_id, country_code, local_date)` (including provisional `bidbeacon` / `ams` rows).
  2. Insert normalized authoritative rows with `source = 'change_history'`.
  3. Upsert `change_history_sync_state` with latest `reconciled_at`.

This keeps one canonical per-day result while still allowing immediate local writes before authoritative daily replacement.

## Read Path (Explicit)

History is read through explicit history surfaces, not entity detail endpoints:

- API: `api.client.historyList` (aliased as `api.cli.historyList`)
  - Input: `config`, `entityType`, `entityId`, optional `range`, optional `limit`, optional `offset`
  - `entityType`: `campaign` | `adGroup` | `ad` | `target`
- CLI:
  - `bb history campaigns <campaign_id> [--range <range>]`
  - `bb history ad-groups <ad_group_id> [--range <range>]`
  - `bb history ads <ad_id> [--range <range>]`
  - `bb history targets <target_id> [--range <range>]`
  - Optional flags: `--limit`, `--offset`

Entity detail APIs (for example `targets.get`) return current entity state only.

## Sync State

`change_history_sync_state` tracks per-account/day authoritative reconciliation status used by the change-history jobs.
