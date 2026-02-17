# @bidbeacon/http-client

Typed tRPC client for the BidBeacon API.

## Install

```bash
npm install @bidbeacon/http-client
```

## Usage

```ts
import { createBidBeaconClient } from '@bidbeacon/http-client';

const client = createBidBeaconClient({
  baseUrl: 'https://bidbeacon.merchbase.co',
  apiKey: 'bbk_...'
});

const accounts = await client['accounts/list'].query();
```

Batching is enabled by default.
You can tune or disable batching:

```ts
const client = createBidBeaconClient({
  baseUrl: 'https://bidbeacon.merchbase.co',
  apiKey: 'bbk_...',
  batch: true, // default
  batchMaxItems: 20, // default when batching
  batchMaxURLLength: 2000, // default when batching
});

const unbatchedClient = createBidBeaconClient({
  baseUrl: 'https://bidbeacon.merchbase.co',
  apiKey: 'bbk_...',
  batch: false, // optional
});
```

The client is scoped to slash-style CLI paths (for example `campaigns/list`) so it stays in lockstep with the CLI.

Change history is available through an explicit endpoint:

```ts
const history = await client['history/list'].query({
  config: { accountId: '...', countryCode: 'US', range: 'today' },
  entityType: 'target',
  entityId: '1234567890',
  range: '7d', // optional override of config.range
  limit: 20,
});
```

## Types

```ts
import type { CliRouterInputs, CliRouterOutputs } from '@bidbeacon/http-client';

type CampaignsListInput = CliRouterInputs['campaigns/list'];
type CampaignsListOutput = CliRouterOutputs['campaigns/list'];
```

## Maintenance

When the API router changes, regenerate the bundled router types:

```bash
bun run api-client:types
```
