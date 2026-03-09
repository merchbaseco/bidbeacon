# Changelog

All notable changes to this project will be documented in this file.

## v0.4.0 - 2026-03-09

### Added

- Added `bb config set storage-dir <path>` so the CLI can persist config/data outside `~/.bidbeacon`, and updated `bb config show` to print the active storage path.

### Changed

- Changed CLI authentication to read `BB_API_KEY` from the environment instead of from persisted local config.
- Updated CLI help, README, and regression coverage for the new storage-dir and env-auth workflow.

### Removed

- Removed `bb config set api-key` and stopped carrying API keys forward in CLI config files.

## v0.3.2 - 2026-03-06

### Added

- Added automated release-version sync checks so version bumps now fail fast when `package.json`, published package versions, or `bun.lock` drift apart.

### Fixed

- Fixed the npm CLI build so installed `bb` binaries ship with a runnable Node entrypoint and no longer bundle server-only code into the published package.

## v0.3.1 - 2026-03-06

### Added

- Added a `bb changelog` command so installed CLI users and agents can inspect packaged release notes for the current version, a requested version, or the full changelog.

### Changed

- Bundled `CHANGELOG.md` with the CLI package and updated the CLI build, help, README, and spec docs so release notes ship with npm installs.

## v0.3.0 - 2026-03-06

### Added

- Added dedicated ASIN CLI command regression coverage for enabled-only scope handling and chunked overview aggregation.

### Changed

- Changed `bb asins overview` to compute rollups from matched ad metrics only and to drill down by `campaign`, `ad-group`, or `ad`.
- Changed `bb asins tree`, `bb asins overview`, and `metrics --asin` to default ASIN scope resolution to enabled entities unless `--state` or `--all` is passed.
- Updated the CLI help, README, and CLI spec to document the new ASIN scope defaults and overview contract.

## v0.2.4 - 2026-03-06

### Added

- Added ASIN tree overview and metrics support for `--asin` workflows.

### Changed

- Refreshed the Bun lockfile for the v0.2.3 release baseline.

## v0.2.3 - 2026-03-05

### Added

- Added CLI response context metadata in command output and documented it in CLI help/spec references.

## v0.2.2 - 2026-03-05

### Added

- Published `@bidbeacon/cli` for global npm installs and expanded CLI help/discoverability, including inline ASIN metrics support in command output.
- Added deploy notifications to Discord with an AI-generated summary payload for rollout visibility.

### Changed

- Migrated the public HTTP client package namespace to `@bidbeacon/http-client` across app, CLI, and docs.
- Standardized deploy notifications on a shared captainhook notifier and explicit Discord webhook `User-Agent` handling.

### Fixed

- Updated Amazon Ads request handling to enforce per-attempt timeouts across throttled and retried API calls.

## v0.2.1 - 2026-02-16

### Added

- Added nullable `productTitle` on ad entities in the public API so `ads/get`, `ads/list`, and ASIN tree ad payloads can include product titles when available from Amazon ad exports.

### Changed

- Updated ad entity sync ingestion and schema to persist `ad.product_title`, and bumped `@merchbase/bidbeacon-http-client` to `0.2.1`.

## v0.2.0 - 2026-02-13

### Added

- Added configurable API client batching controls: `batch`, `batchMaxItems`, and `batchMaxURLLength`.
- Added regression coverage to ensure long tRPC-style batched route params are accepted by server routing.
- Added a documented, searchable version-bump commit convention: `feat: version bump vX.Y.Z`.

### Changed

- Increased server router path param limit for tRPC batching to prevent false 404s under concurrent batched requests.
- Updated release documentation to make version bumps agent-driven end-to-end, including commit-range review and versioned changelog generation.

### Removed

- Removed the legacy local changelog generation script and its references to keep changelog updates strictly AI-driven via the release process.

## v0.1 - 2026-02-12

### Launch Highlights

- BidBeacon launches pre-beta as one focused workflow to run Amazon Ads performance from dashboard, API, and CLI in one account-scoped system.
- Teams get secure multi-account access out of the box with Clerk auth, API keys, and clean account-level permissions built directly into every surface.
- Operators can move faster with near-real-time Amazon Marketing Stream ingestion, resilient retry handling, and reporting tuned for daily decisions.
- Campaign analysis is now easier to automate with a typed public API client plus CLI commands for campaigns, ads, targets, ASIN views, and lifecycle actions.
- Optimization history is first-class with dedicated change-history endpoints and range filters, so teams can quickly see what changed and why performance moved.
- The public API surface is standardized and production-minded, with slash-style paths and account-safe contracts designed for automation from day one.
