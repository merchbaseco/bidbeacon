# API Client Spec (Typed npm)

This spec defines the public npm client package that exposes typed access to the BidBeacon API without duplicating the CLI or server logic.

## Goals

- Provide a stable, typed JavaScript client for external codebases.
- Keep the surface area aligned with the CLI API so there is one canonical API surface.
- Avoid a separate REST surface that would need independent maintenance.

## Package

- Name: `@bidbeacon/api-client`
- Location: `packages/bidbeacon-api-client`
- Output: `dist/` (ESM + `.d.ts`)

## Philosophy

- The client mirrors the public API surface shared by the CLI.
- The client hides the `api.client` router path (aliased as `api.cli` for compatibility) from consumers.
- Typed inputs and outputs are derived from the server router, not duplicated.
- Publish manually to npm for now.

## Client Surface

- Primary entrypoint: `createBidBeaconClient({ baseUrl, apiKey, headers, batch })`
- Usage returns the CLI surface directly, for example:

```ts
const client = createBidBeaconClient({ baseUrl, apiKey });
const accounts = await client.accountsList.query();
```

## Types

- `CliRouterInputs` and `CliRouterOutputs` are exported for type-safe integration.
- These types are generated from the server router and bundled into the package.
- For shape-sensitive endpoints (for example `asinsGet`), use `CliRouterOutputs[...]` directly instead of hardcoding local interfaces.

## Build + Publish

```bash
bun run api-client:build
```

```bash
cd packages/bidbeacon-api-client
npm login
npm publish --access public
```

Bump `packages/bidbeacon-api-client/package.json` version before every publish.
