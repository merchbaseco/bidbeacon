# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## v0.3 - 2026-02-11

### Added

- Public API now supports AUTO target types (Close/Loose/Substitutes/Complements) and exposes auto subtypes in target responses.

### Changed

- Bumped `packages/bidbeacon-api-client` to `0.1.6`.

## v0.2 - 2026-02-10

### Added

- Add ASIN campaign tree CLI command.
- Filter ads by ASIN.
- Add Amazon Ads retry policy.
- Harden ad entity sync flow.
- Add contextual CLI help.

### Fixed

- Improve CLI ID errors.
- Deploy: install `bb` wrapper pointing at `packages/bidbeacon-cli`.
- Add lint scripts and clean lint.
- Simplify CLI help header.

## v0.1 - through 2026-02-09

### Highlights

- First internal beta build of BidBeacon.
- One place to manage Amazon Ads performance across dashboard, API, and CLI with secure account-scoped access.
- Faster optimization loops with near-real-time ingestion and reporting that turns campaign data into clear next actions.
