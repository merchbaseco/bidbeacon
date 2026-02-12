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

History is explicit and entity-scoped:

```ts
const history = await client.historyList.query({
  config: { accountId: '...', countryCode: 'US', range: 'today' },
  entityType: 'campaign',
  entityId: '1234567890',
  range: 'yesterday', // optional override of config.range
  limit: 50,
});
```

Entity detail endpoints return current state; change history is fetched via `historyList`.

## Types

- `CliRouterInputs` and `CliRouterOutputs` are exported for type-safe integration.
- These types are generated from the server router and bundled into the package.
- For shape-sensitive endpoints (for example `asinsGet`), use `CliRouterOutputs[...]` directly instead of hardcoding local interfaces.
- Metrics naming: conversion count is exposed as `purchases`.

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

## Versioning Policy

BidBeacon uses two independent version tracks:

- App release versions in `CHANGELOG.md` (for example `v0.3`) track product/server/dashboard releases.
- npm package versions in `packages/bidbeacon-api-client/package.json` (for example `0.3.0`) track `@bidbeacon/api-client` releases.

These versions do not need to match exactly.

Use SemVer for the API client package:

- `MAJOR`: breaking changes to the published client contract (removed/renamed procedures, incompatible input/output changes).
- `MINOR`: backward-compatible additions to the public client surface.
- `PATCH`: backward-compatible fixes or internal improvements.

Release checklist for API client changes:

1. Run `bun run api-client:build`.
2. Bump `packages/bidbeacon-api-client/package.json`.
3. Update `CHANGELOG.md` in the same PR with the new client package version.
4. Publish with `npm publish --access public`.
