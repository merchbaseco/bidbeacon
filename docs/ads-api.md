# Ads API (Settings + Details)

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
