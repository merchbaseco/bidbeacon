# BidBeacon verification map

This directory is the maintained source for verifying BidBeacon against a local stack. Read this index, then follow one feature file.

## Baseline preconditions

- Run `.cursor/skills/verify-bidbeacon/control-bidbeacon launch --api-port 8090 --dashboard-port 4174` from the repo root.
- Require doctor JSON with `"ok": true` and `"account": "Cedar & Coil (dev seed)"`.
- The seeded Advertiser Account id is `5eed0000-0000-4000-8000-000000000001`. The legacy ads account id is `amzn1.ads-account.g.dev5eedcedarcoil0000000001`.
- Open the dashboard at `http://127.0.0.1:4174/`, or `http://127.0.0.1:4173/` when that port is the one launch adopted.
- Drive only the run whose path is `/tmp/bidbeacon-verify/run.json`.
- Postgres is one shared `bidbeacon` database. A second server sees the same rows.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise.
- Prefer the accessible name in the feature file over a CSS selector.
- Keep quoted names and flags unchanged.
- Browser actions go through `control-bidbeacon browser`.
- HTTP actions go through `control-bidbeacon http`.
- MCP actions go through `control-bidbeacon mcp`.
- The `bb` CLI goes through `control-bidbeacon cli`.
- The stream handler goes through `control-bidbeacon worker`.
- Cleanup may delete the fixture row. It must not delete proof files.

## Proof and skip reporting

- Capture the action and the resulting state.
- UI proof includes page text and a screenshot that shows BidBeacon and the account or campaign name.
- HTTP proof includes the status line and the response body.
- Worker proof includes `worker/fixture.json` and a second `worker show` of the same row.
- Record the feature id and the entry point with the artifact.
- An entry that cannot run is a failure. Save the command output and name the missing precondition.
- Do not mark that entry passed because a different entry returned the same data.

## Feature entry contract

Each feature file starts with an H1 and one paragraph. Then it has four H2 sections, in order.

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with control-bidbeacon`
4. `Gotchas`

## Features

- [Update a campaign](./update-campaign.md) pauses a seeded campaign through the local Amazon Ads gateway and reads the new state back.
- [Account home](./account-home.md) covers the signed-in dashboard for the seeded account.
- [Campaign search](./campaign-search.md) covers the campaign table search and the HTTP search query.
- [Stream fixture](./stream-fixture.md) covers one Sponsored Products traffic message through the worker handler.
- [MCP accounts](./mcp-accounts.md) covers `list_advertiser_accounts` on the HTTP MCP server.
- [CLI accounts](./cli-accounts.md) covers `bb advertiser-accounts list` without a suite API key.
