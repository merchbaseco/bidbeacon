---
summary: Documents canonical entity-change storage, reconciliation, and its current and accepted public read paths.
read_when:
  - changing change-history ingestion, reconciliation, storage, or public Search behavior
---

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
- Target-like entities (automatic, keyword, product targeting, negative keyword):
  - `STATUS` -> `state_change`
  - `BID_AMOUNT` (where available) -> `bid_change`

## Write Paths

### BidBeacon-triggered writes (immediate)
- Shared operation mutations (`createCampaign`, `updateCampaign`, `createAdGroup`,
  `updateAdGroup`, `createAd`, `updateAd`, `createKeywordTarget`, `createProductTarget`,
  `createAutomaticTarget`, `createNegativeKeyword`, `createNegativeProductTarget`, and
  `updateTarget`) plus the legacy public mutation helpers
  (`updateCampaignRow`, `updateAdGroupRow`, `updateAdRow`, `updateTargetRow`) write history rows
  with `source = 'bidbeacon'`.
- `create_sponsored_products_campaign` delegates each child and its final Campaign state change to
  those same mutation paths, so composite success and partial completion retain the ordinary
  immediate `bidbeacon` Change events for every accepted resource.
- Shared ad-group and target bid mutation routers also write `bid_change` rows.

### AMS-triggered writes (sub-daily)
- Campaign/ad/ad-group/target handlers emit `state_change` rows.
- Ad-group and target handlers emit `bid_change` rows when AMS bid payloads change.

### Change History API writes (authoritative daily reconcile)
- `sync-change-history` (hourly scheduler) fans out account jobs.
- `sync-change-history-for-account` fetches Amazon Change History and reconciles by local day.
- Change History requests use the regional Amazon Advertising API base URL (`advertising-api.amazon.com`, `advertising-api-eu.amazon.com`, `advertising-api-fe.amazon.com`) with `POST /history`.
- To stay inside Amazon's rolling 90-day retention requirement, sync windows start at account-local midnight for `today - 89 days`.
- Reconcile behavior for each local day:
  1. Delete existing rows for `(account_id, country_code, local_date)` (including provisional `bidbeacon` / `ams` rows).
  2. Insert normalized authoritative rows with `source = 'change_history'`.
  3. Upsert `change_history_sync_state` with latest `reconciled_at`.

This keeps one canonical per-day result while still allowing immediate local writes before authoritative daily replacement.

## Read path

The implemented public contract reads history with `search` and `resource: "change_event"` as defined in [cli-spec.md](cli-spec.md). Change events use the same explicit Account ID, field selection, filters, inclusive account-local date range, ordering, and cursor contract as other Searches. Search maps internal entity/event/field/source values to the public `changeEvent.*` vocabulary and returns previous/current values with their JSON types, including structured placement-adjustment objects.

### Current pre-migration path

The currently implemented API and CLI still read history through dedicated surfaces:

- HTTP API (tRPC path): `/api/history/list`
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
