# Changelog

All notable changes to this project will be documented in this file.

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
