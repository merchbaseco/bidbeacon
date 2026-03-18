# API Client Spec (Typed npm)

This spec defines the public npm client package that exposes typed access to the BidBeacon API without duplicating the CLI or server logic.

## Goals

- Provide a stable, typed JavaScript client for external codebases.
- Keep the surface area aligned with the CLI API so there is one canonical API surface.
- Avoid a separate REST surface that would need independent maintenance.

## Package

- Name: `@bidbeacon/http-client`
- Location: `packages/bidbeacon-api-client`
- Output: `dist/` (ESM + `.d.ts`)

## Philosophy

- The client mirrors the public API surface shared by the CLI.
- The client uses slash-style procedure keys that mirror CLI command shape (for example `campaigns/list`).
- Typed inputs and outputs are derived from the server router, not duplicated.
- Publish manually to npm for now.

## Client Surface

- Primary entrypoint: `createBidBeaconClient({ baseUrl, apiKey, headers, batch, batchMaxItems, batchMaxURLLength })`
- Usage returns the CLI surface directly, for example:

```ts
const client = createBidBeaconClient({ baseUrl, apiKey });
const accounts = await client['accounts/list'].query();
```

Batch behavior:

- `batch` defaults to `true`.
- `batchMaxItems` defaults to `20` (applies when batching is enabled).
- `batchMaxURLLength` defaults to `2000` (applies when batching is enabled).
- `batchMaxURLLength` should stay below the server route param limit; this project uses Fastify `maxParamLength: 4096`.
- Server note: Fastify's default router `maxParamLength` (`100`) can reject long batched procedure paths with 404; configure a higher value (for example `4096`) on the API server.

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
NPM_TOKEN="$(security find-generic-password -a "$USER" -s rankwrangler-npm-token -w)" npm whoami
NPM_TOKEN="$(security find-generic-password -a "$USER" -s rankwrangler-npm-token -w)" npm publish --access public
```

Bump `packages/bidbeacon-api-client/package.json` as part of the shared release process in `docs/release-process.md`.
That release flow now also requires `bun install` and `bun run version:check` so `bun.lock` stays aligned with the published client version.

## Versioning Policy

BidBeacon uses one shared SemVer release version across surfaces:

- Tag: `vX.Y.Z`
- App: `package.json#version`
- API client: `packages/bidbeacon-api-client/package.json#version`
- CLI: `packages/bidbeacon-cli/package.json#version`

Version lockstep is mandatory: these three version numbers must match exactly for every release.
Do not publish `@bidbeacon/http-client` or `@bidbeacon/cli` at versions that diverge from `package.json`.
Do not publish if `bun.lock` still resolves `@bidbeacon/http-client` to an older version.

Use SemVer for the API client package:

- `MAJOR`: breaking changes to the published client contract (removed/renamed procedures, incompatible input/output changes).
- `MINOR`: backward-compatible additions to the public client surface.
- `PATCH`: backward-compatible fixes or internal improvements.

Release checklist for API client changes:

1. Update shared version files (`package.json`, CLI package, and API client package) to the same `X.Y.Z`.
2. Review all commits since the previous version bump and summarize them under a new `CHANGELOG.md` version header (`## vX.Y.Z - YYYY-MM-DD`).
3. Never use an `Unreleased` header in `CHANGELOG.md`; changelog updates happen only during version bumps.
4. Ensure the release commit follows the searchable convention from `docs/release-process.md`: `feat: version bump vX.Y.Z`.
5. Run `bun run api-client:build`.
6. Run `bun run test` and publish only when tests pass.
7. Publish with `npm publish --access public`.
8. Tag and push with `git tag vX.Y.Z && git push origin vX.Y.Z`.
