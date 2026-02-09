# @bidbeacon/api-client

Typed tRPC client for the BidBeacon API.

## Install

```bash
npm install @bidbeacon/api-client
```

## Usage

```ts
import { createBidBeaconClient } from '@bidbeacon/api-client';

const client = createBidBeaconClient({
  baseUrl: 'https://bidbeacon.merchbase.co',
  apiKey: 'bbk_...'
});

const accounts = await client.accountsList.query();
```

The client is scoped to the CLI surface (`api.cli.*`) so it stays in lockstep with the CLI.

## Types

```ts
import type { CliRouterInputs, CliRouterOutputs } from '@bidbeacon/api-client';

type CampaignsListInput = CliRouterInputs['campaignsList'];
type CampaignsListOutput = CliRouterOutputs['campaignsList'];
```

## Maintenance

When the API router changes, regenerate the bundled router types:

```bash
bun run api-client:types
```
