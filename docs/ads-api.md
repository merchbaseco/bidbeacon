---
summary: Documents the currently implemented internal settings/detail API during migration to the accepted public Search contract.
read_when:
  - changing the current ads routers or migrating them to the public MCP and CLI operation layer
---

# Ads API (current implementation)

> The accepted public contract is [cli-spec.md](cli-spec.md). This document records the pre-migration routers that the dashboard and existing CLI still call; its endpoint names, offset cursor, Amazon-shaped fields, and defaults are not the target public interface.

This API exposes campaign/ad group/ad/target settings from the export tables and supports bid edits for Sponsored Products (SP) only. It intentionally does **not** surface AMS Campaign Management raw JSON.

## Access Control

All endpoints require an `accountId` and enforce `ctx.assertAccountAccess(accountId)`.

## Pagination

List endpoints use offset pagination:

- `pagination.limit` (default 50, max 200)
- `pagination.cursor` (string offset)

If more rows exist, `nextCursor` is returned.

## Campaigns

### List

Input: `ads.campaigns.list`

- `accountId` (required)
- `countryCode` (optional)
- `filters`: `search`, `state`, `adProduct`
- `sort.field`: `lastUpdatedDateTime | name | startDate | budgetAmount | state`
- `sort.direction`: `asc | desc`

Output fields:

- `campaignId`, `accountId`, `countryCode`, `name`, `adProduct`, `state`, `deliveryStatus`
- `targetingSettings`, `bidStrategy`, `budgetType`, `budgetPeriod`, `budgetAmount`
- `startDate`, `endDate`, `creationDateTime`, `lastUpdatedDateTime`

### Detail

Input: `ads.campaigns.get` (`accountId`, `campaignId`)

Output: single campaign row (same shape as list).

## Ad Groups

### List

Input: `ads.adGroups.list`

- `filters`: `search`, `state`, `adProduct`, `campaignId`
- `sort.field`: `lastUpdatedDateTime | name | bidAmount | state`

Output fields:

- `adGroupId`, `campaignId`, `accountId`, `countryCode`, `name`, `adProduct`, `state`, `deliveryStatus`
- `bidAmount`, `creationDateTime`, `lastUpdatedDateTime`

### Detail

Input: `ads.adGroups.get` (`accountId`, `adGroupId`)

Output: single ad group row.

### Update Bid (SP only)

Input: `ads.adGroups.updateBid`

- `accountId`
- `adGroupId`
- `bidAmount` (positive number, max 2 decimals)

Notes:

- Only allowed for `adProduct = SPONSORED_PRODUCTS` (or `SP`).
- Updates Amazon Ads synchronously, then updates local DB on success.

Output:

- `adGroupId`, `bidAmount`, `lastUpdatedDateTime`

## Ads

### List

Input: `ads.ads.list`

- `filters`: `search`, `state`, `adProduct`, `campaignId`, `adGroupId`, `productAsin`
- `sort.field`: `lastUpdatedDateTime | adId | state`

Output fields:

- `adId`, `campaignId`, `adGroupId`, `accountId`, `countryCode`
- `adProduct`, `adType`, `state`, `deliveryStatus`, `productAsin`
- `creationDateTime`, `lastUpdatedDateTime`

### Detail

Input: `ads.ads.get` (`accountId`, `adId`)

Output: single ad row.

## Targets

### List

Input: `ads.targets.list`

- `filters`: `search`, `state`, `adProduct`, `campaignId`, `adGroupId`, `negative`, `targetType`, `targetMatchType`
- `sort.field`: `lastUpdatedDateTime | bidAmount | state | targetType`
- `targetType` supports `KEYWORD`, `PRODUCT`, and `AUTO`

Output fields:

- `targetId`, `campaignId`, `adGroupId`, `accountId`, `countryCode`
- `adProduct`, `state`, `deliveryStatus`, `negative`, `bidAmount`
- `targetType`, `targetMatchType`, `targetKeyword`, `targetAsin`, `targetDisplay`
- `creationDateTime`, `lastUpdatedDateTime`

### Detail

Input: `ads.targets.get` (`accountId`, `targetId`)

Output: single target row.

### Update Bid (SP only)

Input: `ads.targets.updateBid`

- `accountId`
- `targetId`
- `bidAmount` (positive number, max 2 decimals)

Notes:

- Not allowed for `negative` targets.
- Not allowed for campaign-level targets (missing `adGroupId`).
- Only allowed for `adProduct = SPONSORED_PRODUCTS` (or `SP`).

Output:

- `targetId`, `bidAmount`, `lastUpdatedDateTime`

## Search Behavior

Search matches:

- Campaigns: name, campaignId
- Ad groups: name, adGroupId
- Ads: adId, productAsin
- Targets: keyword, ASIN, targetId

## Error Handling

- `NOT_FOUND` when entity is missing for the account.
- `BAD_REQUEST` for invalid bid updates (non-SP, negative target, campaign-level target).

## Shared operation-layer mutations

The accepted public write contract lives in the shared operation layer under `src/operations/`.
The legacy routers above remain dashboard-facing during migration and do not define the public
mutation vocabulary. Every operation requires the opaque BidBeacon Advertiser Account UUID,
proves account-owned ancestry before the Amazon call, waits for the production gateway response,
returns a canonical resource, reconciles the archive, and records immediate `bidbeacon` Change
events.

### `create_campaign`

`create_campaign` requires an explicit BidBeacon Advertiser Account UUID, name, `ENABLED` or
`PAUSED` state, `dailyBudget`, public `bidStrategy` (`FIXED`, `DYNAMIC_DOWN_ONLY`, or
`DYNAMIC_UP_AND_DOWN`), `targetingMode` (`AUTO`, `MANUAL_KEYWORD`, or `MANUAL_PRODUCT`), and
account-local `startDate`. `endDate` is optional and must not precede `startDate`. Placement
adjustments are optional percentage-point increases for `topOfSearch`, `restOfSearch`,
`productPages`, and `amazonBusiness`; values are integers from 0 through 900.

The operation resolves the account UUID to its Amazon profile, marketplace, currency, timezone,
and API region. It maps the public controls to the Amazon Sponsored Products Campaign payload,
waits for the real gateway response, maps the response back to the canonical Campaign shape, and
reconciles the successful result into the local Campaign archive. Creation also records immediate
`bidbeacon` Change events for state, budget, bid strategy, and placement controls when values are
present.

### `update_campaign`

`update_campaign` requires an explicit Account UUID, an existing Campaign ID in that account, and
a non-empty `changes` object. The object is limited to absolute `state`, `dailyBudget`,
`bidStrategy`, and `placementBidAdjustments` values. `ARCHIVED` is accepted only here, for an
existing Campaign, must be the only requested change, and routes to Amazon's Campaign delete
endpoint. An omitted placement key remains unchanged at Amazon; a placement value of `0` removes
that adjustment. The gateway call is synchronous, so the operation does not return until Amazon's
normal throttling and retry policy has completed.

Successful updates reconcile the Campaign archive and write immediate `bidbeacon` Change events.
Amazon rejection, exhausted unavailability, invalid input, missing Campaigns, and denied Account
UUIDs are translated to the stable shared operation error codes rather than leaking transport
exceptions. Amazon account/profile identifiers, transport bid-strategy enums, and raw credentials
are never accepted as public routing or control vocabulary.

### `create_ad_group`

`create_ad_group` requires `accountId`, an account-owned `campaignId`, `name`, `ENABLED` or
`PAUSED` `state`, and `defaultBid`. It maps to the Sponsored Products Ad group create payload
with `bid.defaultBid` and returns the canonical Ad group.

### `update_ad_group`

`update_ad_group` requires an account-owned `adGroupId` and a non-empty `changes` object limited to
absolute `state`, `defaultBid` values. `ARCHIVED` is accepted for an existing Ad group. The
archive state must be the only requested change and routes to Amazon's Ad-group delete endpoint.
The operation writes `state_change` and `bid_change` events for controls present in the patch when
the accepted value differs from the archive.

### `create_ad`

`create_ad` requires `accountId`, an account-owned `adGroupId`, a 10-character alphanumeric ASIN,
and `ENABLED` or `PAUSED` `state`. It maps the ASIN into the Sponsored Products product-ad
creative and returns the canonical Ad.

### `update_ad`

`update_ad` requires an account-owned `adId` and a non-empty `changes` object limited to `state`.
`ARCHIVED` is accepted for an existing Ad and routes to Amazon's Product-ad delete endpoint.
Successful updates reconcile the Ad archive and write an immediate `state_change` event. Amazon
rejection, exhausted unavailability, invalid input, missing ancestry, and denied Account UUIDs use
the stable shared operation error codes.

### Target mutations

Target primitive operations require Sponsored Products Campaign/Ad-group ancestry before calling
Amazon. Positive keyword targets accept `BROAD`, `PHRASE`, or `EXACT` with an explicit state
and bid. Positive product targets accept one ASIN with an explicit state and bid. Negative
keyword targets accept `PHRASE` or `EXACT`, and negative product targets accept one ASIN; both
require an explicit Campaign ID and Ad-group ID for local ownership proof and never accept a bid.
Category targets and refinement expressions are not part of this surface.

`update_target` requires an existing Target in the explicit Advertiser Account and a non-empty
absolute patch containing `state` and/or `bid`. Bids are accepted only for positive ad-group
Targets. Negative Targets reject bid changes. Existing campaign-level negatives may be archived
by ID, and cannot be created. `ARCHIVED` must be the only requested change, remains terminal, and
routes to the Amazon delete endpoint for the Target's positive/negative, keyword/Product, and
Campaign/Ad-group scope.

Each successful Target mutation waits for the synchronous Amazon gateway response, returns the
canonical Target representation, upserts the Target archive, and records immediate `bidbeacon`
Change events for accepted state and bid changes. Amazon rejection, exhausted unavailability,
invalid input, missing ancestry, and denied Account UUIDs use the stable shared operation error
codes.

### Composite Sponsored Products campaign creation

`create_sponsored_products_campaign` is the preferred synchronous ordinary-launch operation. It
validates one Campaign, one Ad group, one or more advertised ASIN Ads, exactly one targeting mode,
and optional ad-group negative keyword/ASIN Targets before the first Amazon write. Automatic mode
creates the four automatic Target groups and uses `adGroup.defaultBid` for omitted overrides;
manual keyword and product modes create only their respective positive Target kind.

The operation creates the Campaign `PAUSED`, all children `ENABLED`, and applies a requested
Campaign `ENABLED` state only after every child succeeds. A requested `PAUSED` result does not
issue a redundant Campaign update. Success returns canonical Campaign, Ad group, Ads, and Targets.
If a later synchronous primitive fails, the operation stops without rollback, leaves the paused
Campaign and successful resources locally reconciled, and raises `COMPOSITE_PARTIAL_FAILURE` with
the successful resources, exact failed primitive input, and a sanitized Amazon error.
