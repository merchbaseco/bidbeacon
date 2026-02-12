# Release Process

This document defines the manual, agent-assisted release flow for BidBeacon.

## Version Scheme

BidBeacon uses one shared SemVer release version across surfaces:

- App/server: `package.json#version`
- API client: `packages/bidbeacon-api-client/package.json#version`
- CLI: `packages/bidbeacon-cli/package.json#version`
- Git tag: `vX.Y.Z`

## Day-to-Day Development

- Commit normally. Not every commit needs a version bump.
- Keep commit subjects descriptive so release summaries are easy to generate.
- Keep feature notes in PRs/commits; consolidate them when cutting a release.

## Release Trigger (Agent-Driven)

When ready, ask the agent directly, for example:

- `version bump bidbeacon to v0.5.0`

The agent should perform this checklist:

1. Determine commit range since the last release tag.
2. Summarize commits into a new `CHANGELOG.md` section for `vX.Y.Z` dated `YYYY-MM-DD`.
3. Update all shared version files to `X.Y.Z`.
4. Run `bun run lint:fix`.
5. Run `bun run test`.
6. Build API client artifacts with `bun run api-client:build`.

## Publish + Tag

After reviewing the release commit:

```bash
git add .
git commit -m "feat: prepare release vX.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

Publish npm package:

```bash
cd packages/bidbeacon-api-client
npm login
npm publish --access public
```

Optional verification:

```bash
npm view @bidbeacon/api-client version
```
