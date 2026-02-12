# API Client Spec (Typed npm)

This spec defines the public npm client package that exposes typed access to the BidBeacon API without duplicating the CLI or server logic.

## Goals

- Provide a stable, typed JavaScript client for external codebases.
- Keep the surface area aligned with the CLI API so there is one canonical API surface.
- Avoid a separate REST surface that would need independent maintenance.

## Package

- Name: `@merchbase/bidbeacon-http-client`
- Location: `packages/bidbeacon-api-client`
- Output: `dist/` (ESM + `.d.ts`)

## Philosophy

- The client mirrors the public API surface shared by the CLI.
- The client uses slash-style procedure keys that mirror CLI command shape (for example `campaigns/list`).
- Typed inputs and outputs are derived from the server router, not duplicated.
- Publish manually to npm for now.

## Client Surface

- Primary entrypoint: `createBidBeaconClient({ baseUrl, apiKey, headers, batch })`
- Usage returns the CLI surface directly, for example:

```ts
const client = createBidBeaconClient({ baseUrl, apiKey });
const accounts = await client['accounts/list'].query();
```

History is explicit and entity-scoped:

```ts
const history = await client['history/list'].query({
  config: { accountId: '...', countryCode: 'US', range: 'today' },
  entityType: 'campaign',
  entityId: '1234567890',
  range: 'yesterday', // optional override of config.range
  limit: 50,
});
```

Entity detail endpoints return current state; change history is fetched via `history/list`.

## Types

- `CliRouterInputs` and `CliRouterOutputs` are exported for type-safe integration.
- These types are generated from the server router and bundled into the package.
- For shape-sensitive endpoints (for example `asins/get`), use `CliRouterOutputs[...]` directly instead of hardcoding local interfaces.
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

Bump `packages/bidbeacon-api-client/package.json` as part of the shared release process in `docs/release-process.md`.

## Versioning Policy

BidBeacon uses one shared SemVer release version across surfaces:

- Tag: `vX.Y.Z`
- App: `package.json#version`
- API client: `packages/bidbeacon-api-client/package.json#version`
- CLI: `packages/bidbeacon-cli/package.json#version`

Use SemVer for the API client package:

- `MAJOR`: breaking changes to the published client contract (removed/renamed procedures, incompatible input/output changes).
- `MINOR`: backward-compatible additions to the public client surface.
- `PATCH`: backward-compatible fixes or internal improvements.

Release checklist for API client changes:

1. Update shared version files (`package.json`, CLI package, and API client package) to the same `X.Y.Z`.
2. Add a new `CHANGELOG.md` release section from commit summaries.
3. Run `bun run api-client:build`.
4. Publish with `npm publish --access public`.
5. Tag and push with `git tag vX.Y.Z && git push origin vX.Y.Z`.
