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

During implementation or review, do not publish packages, create a release, tag, push, or deploy. Cut the version with the checklist below. Deploy Stack publishes after that commit is in production.

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
4. Update the shared release version to `X.Y.Z`.
   - `package.json` `version`
   - `packages/bidbeacon-api-client/package.json` `version`
   - `packages/bidbeacon-cli/package.json` `version` and its dependency on `@bidbeacon/http-client`
   - Leave the root dependency and `bun.lock` on the previous changelog version. npm does not have `X.Y.Z` yet, and Deploy Stack installs before it publishes.
   - After Deploy Stack has published `X.Y.Z`, a follow-up commit moves the root dependency to `X.Y.Z` and refreshes `bun.lock`.
   - `bun run version:check` accepts either pin and fails on any other mismatch.
5. Run `bun run lint:fix`.
6. Run `bun run api-client:build`.
7. Run `bun run version:check`.
8. Build CLI artifacts with `bun run cli:build`.
9. Run `bun run test`.
10. Do not publish, tag, or open a GitHub Release from the version-bump commit. Deploy Stack publishes `@bidbeacon/http-client`, then `@bidbeacon/cli`, and pushes `vX.Y.Z` after that commit is in production.

## Completion Criteria

The version-bump commit is complete when all are true:

- Shared versions updated (`package.json`, `packages/bidbeacon-cli/package.json`, and `packages/bidbeacon-api-client/package.json`).
- The CLI dependency on `@bidbeacon/http-client` matches the shared release version.
- The root dependency and `bun.lock` either match that version or still pin the previous changelog version. `bun run version:check` passes.
- `CHANGELOG.md` has a new versioned section for that release.
- `bun run lint:fix`, `bun run version:check`, `bun run api-client:build`, `bun run cli:build`, and `bun run test` have succeeded.
- Release commit uses `feat: version bump vX.Y.Z`.
- The commit does not publish npm packages or create `vX.Y.Z`.

Deploy Stack publishes `@bidbeacon/http-client@X.Y.Z` and then `@bidbeacon/cli@X.Y.Z`, and pushes the missing tag. It does not open a GitHub Release. If npm publish fails, stop and report the exact error.

## Publish + Tag

Deploy Stack publishes `@bidbeacon/http-client` and then `@bidbeacon/cli` when
that version is not already on npm, after the commit is in production. It
pushes `vX.Y.Z` when the tag is missing. It does not open a GitHub Release.
The version-bump commit does not publish or tag. `bun.lock` cannot pin
`@bidbeacon/http-client` until npm has that version, and the production install
runs before publish, so the commit leaves the root dependency and `bun.lock`
on the previous changelog version. Refresh both in a follow-up once npm has
the release.

To publish and tag by hand instead of Deploy Stack:

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
  npm publish --access public --provenance
```

Note: the repo root package is marked `private: true` and has a `prepublishOnly` block.
Always publish from `packages/bidbeacon-api-client`. The token resolves through
the release 1Password client (`RELEASE_AGENT_TOOLING_OP_TOKEN`).

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
  npm publish --access public --provenance
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
