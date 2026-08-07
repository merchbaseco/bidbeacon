# Changelog

All notable changes to this project will be documented in this file.

## v1.0.0 - 2026-08-07

### Added

- Added the canonical stateless CLI, typed HTTP client, and public operation router for account discovery, Search, composite Sponsored Products creation, primitive creation, and resource updates.
- Added structured Search filters, account-local date ranges, ordering, keyset cursors, `--all` buffering, nested JSON input, and stable machine-readable CLI errors.
- Added generated public router types, representative HTTP serialization coverage, and an opt-in live Sponsored Products smoke test outside deterministic verification.

### Changed

- Changed the public contract to use exact underscore operation names and explicit Advertiser Account UUIDs for every scoped operation.
- Changed CLI success output to direct JSON on stdout and structured error JSON on stderr.

### Fixed

- Fixed `ARCHIVED` updates to use Amazon's v3 resource-specific delete APIs, including idempotent recovery when a resource is already missing at Amazon.

### Removed

- Removed the legacy slash-style public procedure map, selected/configured-account fallback, dedicated list/get/metrics/history/ASIN command paths, aliases, offset pagination, and dedicated pause/resume/delete mutation paths.

## v0.7.0 - 2026-06-15

### Added

- Added `bb auth set --stdin` and hidden interactive auth entry so humans can store keys without shell history and agents can pipe keys in non-interactive runs.
- Added `bb config get`, `bb config unset`, and `bb config reset` so local defaults are easy to inspect, remove, and rebuild.

### Changed

- Changed `bb config show` to include the active auth source without printing secrets.
- Updated CLI help, README, spec docs, and regression coverage for the clarified auth/config surface.

### Removed

- Removed `bb config clear` in favor of explicit `bb config unset <key>` and full `bb config reset`.

## v0.6.0 - 2026-03-18

### Added

- Added CLI secure-store auth commands: `bb auth set`, `bb auth status`, and `bb auth clear`, with macOS Keychain support and Linux Secret Service support.
- Added CLI regression coverage for secure-store behavior, auth precedence, and auth command discoverability.
- Added a runtime flag and example env wiring so local development can disable the server job runner without patching commands by hand.

### Changed

- Changed CLI auth to store only non-secret defaults in `config.json`, keep API keys in the platform secure store, and reserve `BB_API_KEY` for automation, CI, and agent runtimes.
- Updated CLI help, README, and the CLI spec to document the new auth model and config boundary.

### Fixed

- Fixed API-key rotation so creating a new key removes prior keys and their account-access rows before saving the replacement.
- Fixed the default storage-dir env example so it matches the CLI's real fallback behavior.

## v0.5.0 - 2026-03-09

### Added

- Added environment-variable overrides for the remaining CLI config values: `BB_STORAGE_DIR`, `BB_BASE_URL`, `BB_ACCOUNT_ID`, and `BB_COUNTRY_CODE`.
- Added internal `.env.example` entries and built-CLI regression coverage for the env-driven config flow.

### Changed

- Changed the CLI to default to a hardcoded `7d` range whenever `--range` is not passed.
- Updated CLI help and README to document the simplified config surface and env precedence.

### Removed

- Removed `bb config set range` and the `BB_RANGE` environment variable.

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
