---
name: verify-bidbeacon
description: Drive a local BidBeacon stack (HTTP/tRPC API, dashboard, MCP, and the Marketing Stream handler) and capture proof. Use when a change to campaigns, performance, accounts, the dashboard, MCP tools, or stream ingestion needs evidence from the running app without a live Amazon Ads write.
---

# Verify BidBeacon

Drive the running app. Unit tests do not replace this.

The command is `.cursor/skills/verify-bidbeacon/control-bidbeacon`, run from the repo root. It resolves env through varlock and pins `BIDBEACON_DATABASE_HOST` to `127.0.0.1`.

## Launch

One local Postgres database named `bidbeacon` is shared by every server on this VM. Do not start a second server on ports `8080` and `4173` while `.cursor/start.sh` already holds them.

```bash
.cursor/skills/verify-bidbeacon/control-bidbeacon launch --api-port 8090 --dashboard-port 4174
```

Launch is ready when stdout is JSON with `"ok": true`, `"account": "Cedar & Coil (dev seed)"`, and `"live"."service": "bidbeacon-server"`. That means Postgres accepts connections, migrations have been applied, the seed account exists, `GET /api/live` returns 200, and the dashboard HTML contains `BidBeacon Dashboard`.

Launch starts Postgres when `127.0.0.1:5432` is down. It runs `scripts/seed-dev-data.ts` only when that account row is missing. It adopts a port that already serves BidBeacon and records a null pid for it. Cleanup will not kill an adopted pid.

Dashboard sign-in works only on `http://127.0.0.1:4173` and `http://127.0.0.1:4174`. Other origins fail the Clerk authorized-party check after the dev ticket is minted.

## Doctor

```bash
.cursor/skills/verify-bidbeacon/control-bidbeacon doctor
```

Run doctor before driving whenever a command looks wrong. Exit 0 means the API live check, the dashboard title, the seed account name, and the Amazon write guard all hold. Owned pids must still be alive. Doctor does not require `GET /api/health` to be 200. That check turns 503 with `failing` containing `ams-stream` about five minutes after boot, because this stack does not poll SQS.

## Drive

Read `features/README.md` and follow one feature file. Commands below are the verbs. The feature file has the exact arguments.

Browser commands talk to headless Chrome through the DevTools socket. They use accessible names, not coordinates.

```bash
.cursor/skills/verify-bidbeacon/control-bidbeacon browser open --url http://127.0.0.1:4174/
.cursor/skills/verify-bidbeacon/control-bidbeacon browser wait --text "SP - Trail Runner Belt - Auto" --path account-home/page.txt
.cursor/skills/verify-bidbeacon/control-bidbeacon browser fill --label "Search Campaign" --value "Trail Runner"
.cursor/skills/verify-bidbeacon/control-bidbeacon browser screenshot --path account-home/home.png
.cursor/skills/verify-bidbeacon/control-bidbeacon browser token
```

`browser token` writes the Clerk session JWT to the run's token file, mode `600`. Do not print the token. Later HTTP and MCP commands read that file.

```bash
.cursor/skills/verify-bidbeacon/control-bidbeacon http get search --input '{"accountId":"5eed0000-0000-4000-8000-000000000001","resource":"campaign","fields":["campaign.name","campaign.state"],"limit":20}' --expect "SP - Trail Runner Belt - Auto" --path http/search.json
.cursor/skills/verify-bidbeacon/control-bidbeacon mcp call list_advertiser_accounts --input '{}' --expect "Cedar & Coil (dev seed)" --path mcp/list_advertiser_accounts.json
.cursor/skills/verify-bidbeacon/control-bidbeacon cli -- advertiser-accounts list
.cursor/skills/verify-bidbeacon/control-bidbeacon worker fixture
```

`http get` is a tRPC query, `GET /api/<procedure>?input=<json>`, with the session bearer. `worker fixture` runs `processAmsMessage` and `routePayload` against local Postgres. Its `deleteMessage` records the call and does not import the SQS client.

`http`, `mcp`, and `cli` exit 2 before any request when the name is an Amazon write (`create_*`, `update_*`, `bb create`, `bb update`, `accounts.sync`, bid updates, and report create or retrieve).

Varlock prints `Command failed with exit code` whenever this helper exits non-zero. Read the helper's stderr line and the exit code. The banner is not a varlock outage.

## Evidence

Write proof under the `evidenceDir` from launch or doctor. The directory is `/tmp/bidbeacon-verify/evidence/<run-id>/`.

A proof shows the action and the resulting state.

- Browser proof is the page text plus a screenshot that shows `BidBeacon` and the account or campaign name.
- HTTP proof is the status line and the JSON body, including the expected campaign or account name.
- Worker proof is `worker/fixture.json` with `"status": "processed"`, `clicks` `7`, and `sqsDeleteCalls` `1`. Read the row back with `worker show` before cleanup.
- A failed entry stays a failure. Save the command output. Do not claim it passed through a different command.

## Cleanup

```bash
.cursor/skills/verify-bidbeacon/control-bidbeacon cleanup
```

Cleanup sends `SIGTERM` to the api, dashboard, and Chrome process groups this run started. It deletes the fixture row `verify-bidbeacon-sp-traffic` from `ams_sp_traffic`. It deletes the run directory, including the session token. It leaves the evidence directory in place. It does not stop Postgres and it does not kill adopted pids. Confirm the evidence path still exists after cleanup.

## Helpers

`.cursor/skills/verify-bidbeacon/control-bidbeacon` is the executable. `worker` is dispatched to `.cursor/skills/verify-bidbeacon/worker-fixture.ts`. There is no second interface.

## External systems

The running server always uses `productionAmazonAdsGateway`. There is no env switch to the test fake. Reads of seeded Postgres do not call Amazon. `create_*` and `update_*` do. Do not drive them.

Default `search` on `ad` or `product` asks RankWrangler for a title and swallows a failure. Pass `fields` that omit `ad.productTitle` and `product.title`.

`bb` reads `MERCHBASE_API_KEY` or the keychain. The cloud schema does not provide a suite API key. `cli` sets `MERCHBASE_API_KEY` to an empty string and uses an empty `BB_STORAGE_DIR`. Expect that entry to fail closed until a key exists.

MCP on `/mcp` accepts a Clerk OAuth bearer. It rejects `ak_` keys. A dashboard session JWT is not an OAuth token. Call the tool anyway and keep the 401 evidence. Do not treat `bun run test:integration src/mcp/server.integration-check.ts` as a drive of the HTTP server. That file uses an in-memory transport and `createFakeAmazonAdsGateway`.

Do not run `bun run worker`. Importing the SQS client requires `BIDBEACON_AMS_QUEUE_URL`, and a successful AWS login long-polls the real queue into this database.

## Gaps

The cloud environment still has to resolve, through varlock and the Development vault, `MERCHBASE_CLERK_SECRET_KEY`, `MERCHBASE_CLERK_PUBLISHABLE_KEY`, `MERCHBASE_CLERK_JWT_KEY`, `MERCHBASE_CLERK_ISSUER`, `BIDBEACON_DEV_CLERK_SIGN_IN_USER_ID`, and the `BIDBEACON_DATABASE_*` settings. Amazon Ads client id, secret, and refresh token are also required for the server process to boot, even when a journey never calls Amazon.

These are not available, and the journeys that need them stay failed:

- A suite `MERCHBASE_API_KEY` for `bb`.
- A Clerk OAuth access token for `/mcp`.
- AWS credentials used only to poll SQS. The fixture covers the handler, not the poller.

`GET /api/health` is the wrong ready check for this stack.

When routes, labels, or seed names change, run `/maintain-verification-skill` and update `features/`.
