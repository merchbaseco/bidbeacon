---
summary: Documents the typed npm client for the canonical BidBeacon operation contract.
read_when:
  - changing the public operation router, generated client types, package version, or publishing workflow
---

# API Client Spec (Typed npm)

The typed npm package is the HTTP projection of the same operation contract used by the CLI and MCP server. It is generated from `src/api/router-public.ts`; it does not define a second business-logic path.

## Package

- Name: `@bidbeacon/http-client`
- Location: `packages/bidbeacon-api-client`
- Output: `dist/` (ESM + `.d.ts`)
- Entry point: `createBidBeaconClient({ baseUrl, credential, headers, batch, batchMaxItems, batchMaxURLLength })`

The `credential` is the shared bearer credential: suite API keys, Clerk session tokens, or OAuth credentials. Account authorization is resolved by the server from the credential and the explicit `accountId` in each scoped input.

## Operation surface

The client exposes these exact operation names as tRPC query/mutation keys:

```text
list_advertiser_accounts
search
performance
create_sponsored_products_campaign
create_campaign
create_ad_group
create_ad
create_keyword_target
create_product_target
create_negative_keyword
create_negative_product_target
update_campaign
update_ad_group
update_ad
update_target
```

Queries use `.query(...)`; creates and updates use `.mutate(...)`. `list_advertiser_accounts` is the only unscoped operation. All other inputs require an opaque Advertiser Account UUID. Search uses the curated Field/metric catalog, account-local date ranges, structured filters, ordering, and keyset cursors described in [cli-spec.md](cli-spec.md).

Metric Search responses include a typed `summary` of all standard metrics over the complete filtered resource result before pagination. Performance returns one complete bounded temporal result without a cursor; ratio fields are nullable when their denominator is zero.

```ts
const client = createBidBeaconClient({ baseUrl, credential });

const accounts = await client.list_advertiser_accounts.query({});
const rows = await client.search.query({
  accountId,
  resource: 'campaign',
  fields: ['campaign.id', 'metrics.orders'],
  filters: [{ field: 'metrics.orders', operator: 'gte', value: 1 }],
  dateRange: { startDate: '2026-08-01', endDate: '2026-08-06' },
  orderBy: [{ field: 'metrics.orders', direction: 'desc' }],
  limit: 50,
});

const series = await client.performance.query({
  accountId,
  dimension: 'account',
  interval: 'day',
  dateRange: { startDate: '2026-08-01', endDate: '2026-08-06' },
  metrics: ['spend', 'sales', 'orders'],
});

const updated = await client.update_campaign.mutate({
  accountId,
  campaignId,
  changes: { state: 'PAUSED' },
});
```

## Types and HTTP behavior

`CliRouterInputs` and `CliRouterOutputs` are inferred from the public router and bundled into the package. Canonical procedure names serialize directly under `/api/<operation-name>`; there are no slash-style aliases or success envelopes. The HTTP client preserves tRPC transport errors so CLI consumers can render the stable operation error contract.

Batching defaults to enabled with 20 items and a 2,000-character URL limit. Disable batching with `batch: false` when one request per operation is required.

## Build and release

```bash
bun run api-client:build
```

The generated `src/app-router.d.ts` and `dist/` files must be clean after a second build. Public procedure removals or incompatible input/output changes are a breaking client release under the repository’s SemVer policy. Update the shared app, CLI, and client versions plus `CHANGELOG.md`; follow [release-process.md](release-process.md). Actual npm publication, tagging, and deployment remain explicit release actions.
