# Release Process

This document defines the manual, agent-assisted release flow for BidBeacon.

## Version Scheme

BidBeacon uses one shared SemVer release version across surfaces:

- App/server: `package.json#version`
- API client: `packages/bidbeacon-api-client/package.json#version`
- CLI: `packages/bidbeacon-cli/package.json#version`
- Git tag: `vX.Y.Z`

This is a strict lockstep rule: server/app, API client, and CLI versions must always be identical.
Never publish a client surface at a divergent version from the app/server release line.

## Day-to-Day Development

- Commit normally. Not every commit needs a version bump.
- Keep commit subjects descriptive so release summaries are easy to generate.
- Keep feature notes in PRs/commits; consolidate them when cutting a release.
- Do not add or maintain an `Unreleased` section in `CHANGELOG.md`.

## Public Contract Changes

The CLI, typed HTTP client, and MCP operation names are one public contract. Removing or renaming a procedure, changing an input shape, or changing an output shape is a breaking client release and requires a major SemVer bump under the current policy. Regenerate `src/app-router.d.ts` and `dist/`, update the CLI README and API-client docs, and add the versioned changelog entry in the same change.

During implementation or review, do not publish packages, create a release, tag, push, or deploy. The release owner runs the publication step first, then refreshes `bun.lock`, runs `bun run version:check`, and continues with the release checklist below.

## Version-Bump Commit Convention

- Every release/version-bump commit message must include `version bump vX.Y.Z`.
- Use this exact format for the release commit subject: `feat: version bump vX.Y.Z`.
- This keeps version bumps searchable in git history and easy for agents to anchor changelog ranges.

## Release Trigger (Agent-Driven)

When ready, ask the agent directly, for example:

- `version bump bidbeacon to v0.5.0`

The agent should perform this checklist:

1. Determine the commit range since the previous version bump:
   - Prefer git tags: `<previous-tag>..HEAD`.
   - If tags are missing, find the latest commit whose subject contains `version bump v`.
   - If local history is incomplete or ambiguous, use GitHub Releases/Compare for the same range (`previous-tag...HEAD`) and use merged PRs from that window.
   - If both tags and release commits are unavailable, use the previous version header in `CHANGELOG.md` as a last-resort cutoff and document that assumption.
2. Review all commits in that range and summarize user-facing changes (features, fixes, behavior changes, docs) into grouped changelog bullets.
3. Add a new versioned section at the top of `CHANGELOG.md`:
   - Format: `## vX.Y.Z - YYYY-MM-DD`
   - `CHANGELOG.md` is only updated during version bumps.
   - Never create `## Unreleased`.
4. Update all shared version files to `X.Y.Z`.
   - `package.json`
   - `packages/bidbeacon-api-client/package.json`
   - `packages/bidbeacon-cli/package.json`
   - The root dependency on `@bidbeacon/http-client` must also match `X.Y.Z`.
   - If any one of these differs, stop and fix versions before build/publish.
5. Run `bun run lint:fix`.
6. Run `bun run api-client:build`.
7. Publish `@bidbeacon/http-client` to npm.
8. Run `bun install` to refresh `bun.lock` now that the new `@bidbeacon/http-client` version exists.
9. Run `bun run version:check`.
   - This fails if package versions, the root `@bidbeacon/http-client` dependency, or `bun.lock` drift apart.
10. Build CLI artifacts with `bun run cli:build`.
11. Run `bun run test`.
12. Only if tests pass, publish `@bidbeacon/cli` to npm.
13. Create a GitHub Release for `vX.Y.Z` using the matching `CHANGELOG.md` section as release notes.

## Completion Criteria

A version bump is only complete when all are true:

- Shared versions updated (`package.json`, `packages/bidbeacon-cli/package.json`, and `packages/bidbeacon-api-client/package.json`).
- Root `package.json` dependency on `@bidbeacon/http-client` matches the shared release version.
- `bun.lock` has been refreshed after publishing `@bidbeacon/http-client`, and `bun run version:check` passes.
- `CHANGELOG.md` has a new versioned section for that release.
- `bun run lint:fix`, `bun run version:check`, `bun run api-client:build`, `bun run cli:build`, and `bun run test` have succeeded.
- Release commit uses `feat: version bump vX.Y.Z`.
- Git tag `vX.Y.Z` exists.
- GitHub Release `vX.Y.Z` exists and matches the release notes from `CHANGELOG.md`.
- npm publish of `@bidbeacon/http-client@X.Y.Z` succeeds.
- npm publish of `@bidbeacon/cli@X.Y.Z` succeeds.

If npm publish fails (for example auth/token/permissions), stop and report the exact error.

## Publish + Tag

After reviewing the release commit:

```bash
git add .
git commit -m "feat: version bump vX.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

Publish npm package:

```bash
cd packages/bidbeacon-api-client
# The publish token is an @internal schema item gated behind the release
# switch, resolved from the Tooling vault. It never touches a file.
MERCHBASE_NPM_PUBLISH_TOKEN="$(BIDBEACON_RESOLVE_RELEASE_TOKENS=true bunx varlock printenv MERCHBASE_NPM_PUBLISH_TOKEN)" \
  npm publish --access public --provenance=false
```

Note: the repo root package is marked `private: true` and has a `prepublishOnly` block.
Always publish from `packages/bidbeacon-api-client`.

Optional verification:

```bash
npm view @bidbeacon/http-client version
```

Publish CLI package:

```bash
cd packages/bidbeacon-cli
# The publish token is an @internal schema item gated behind the release
# switch, resolved from the Tooling vault. It never touches a file.
MERCHBASE_NPM_PUBLISH_TOKEN="$(BIDBEACON_RESOLVE_RELEASE_TOKENS=true bunx varlock printenv MERCHBASE_NPM_PUBLISH_TOKEN)" \
  npm publish --access public --provenance=false
```

Optional verification:

```bash
npm view @bidbeacon/cli version
```

Create GitHub Release notes from the matching changelog section and publish the release:

```bash
mkdir -p .context
awk 'BEGIN{capture=0} /^## vX.Y.Z - /{capture=1; next} /^## v[0-9]/{if(capture) exit} capture{print}' CHANGELOG.md > .context/release-vX.Y.Z-notes.md
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file .context/release-vX.Y.Z-notes.md
```
