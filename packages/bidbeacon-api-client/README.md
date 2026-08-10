# @bidbeacon/http-client

Typed HTTP client for BidBeacon’s canonical operation contract.

## Install and use

```bash
npm install @bidbeacon/http-client
```

```ts
import { createBidBeaconClient } from '@bidbeacon/http-client';

const client = createBidBeaconClient({
  baseUrl: 'https://bidbeacon.merchbase.co',
  credential: 'ak_...',
});

const accounts = await client.list_advertiser_accounts.query({});
const page = await client.search.query({
  accountId: '00000000-0000-4000-8000-000000000001',
  resource: 'campaign',
  fields: ['campaign.id', 'metrics.orders'],
});
console.log(page.summary?.['metrics.orders']);
const target = await client.update_target.mutate({
  accountId: '00000000-0000-4000-8000-000000000001',
  targetId: 'target-1',
  changes: { bid: 0.75 },
});
```

The operation names are verbatim and match the CLI/MCP contract:

`list_advertiser_accounts`, `search`, `create_sponsored_products_campaign`, `create_campaign`, `create_ad_group`, `create_ad`, `create_keyword_target`, `create_product_target`, `create_negative_keyword`, `create_negative_product_target`, `update_campaign`, `update_ad_group`, `update_ad`, and `update_target`.

`list_advertiser_accounts` is the only unscoped operation. Every other operation requires an explicit advertiser account UUID. The client exports `CliRouterInputs` and `CliRouterOutputs`, inferred directly from the server router:

```ts
import type { CliRouterInputs, CliRouterOutputs } from '@bidbeacon/http-client';

type SearchInput = CliRouterInputs['search'];
type SearchOutput = CliRouterOutputs['search'];
```

Performance Search returns `summary` totals for the complete filtered result before pagination. Ratio fields are `null` when their denominator is zero.

Batching is enabled by default. Configure it with `batch`, `batchMaxItems`, and `batchMaxURLLength`, or set `batch: false` for one HTTP request per operation.

## Maintenance

Regenerate the bundled router types and build artifacts after a public router change:

```bash
bun run api-client:build
```

The generated types and `dist/` output are release artifacts. Version changes follow [the release process](../../docs/release-process.md).
