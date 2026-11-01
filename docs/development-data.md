---
summary: What `bun run db:seed:dev` writes, its loopback-only refusal, how the signed-in development user reaches it, and how cloud sessions get all of it.
read_when:
  - seeding a local database so the dashboard renders something
  - changing what the seed produces, which database it may touch, or how cloud sessions get it
  - changing development sign-in, the Access Projection bootstrap, or the dev-server bind address
  - adding a surface that needs data to be worth looking at
---

# Synthetic Development Data

`bun run db:seed:dev` fills a **local** database with one small fabricated
advertiser account, so every dashboard surface, tRPC procedure, MCP operation,
and `bb` command has a believable current week to render instead of an empty
state. It is never run automatically on a developer machine.

Everything it writes is a local row. The seed talks to PostgreSQL and nothing
else — it never calls Amazon, and it creates no reports, exports, or streams
upstream.

One run writes roughly two thousand rows in a couple of seconds:

| What | Shape |
| --- | --- |
| Account and access | One advertiser account for `US`, granted to the shared Merchbase Dev Sign-In user, with that account preselected. |
| Ad structure | Six Sponsored Products campaigns — auto, keyword, and product targeting — with their ad groups, product ads, and keyword, product, auto, and negative targets. |
| Performance | Fourteen days of `performance_daily` ending today, plus `performance_hourly` for today and yesterday. Weekends run hotter, the account trends gently upward, one day spikes, and today stops at the current hour. |
| Reports | Daily and hourly `report_dataset_metadata` across the report state machine — completed, fetching, parsing, failed, and missing. |
| Sync state | Entity export counts and timestamps, plus per-day change-history reconciliation. |
| Optimization history | Bid, budget, and state changes in `entity_change_history` from both the BidBeacon and Change History sources. |
| Operations | Worker job runs and the events they emit, Amazon Ads API call records including rate limits, and Marketing Stream message counts dense enough for the live AMS card. |

Day labels are computed in the account's own reporting timezone, and the newest
day is always today, so the dashboard always describes the current week.

## Running it

| Flag | Effect |
| --- | --- |
| `--seed=<string>` | Picks the dataset. The same seed always produces the same account. |
| `--days=<n>` | Length of the daily performance history. Default 14. |
| `--campaigns=<n>` | Size of the ad structure. Default 6. |
| `--account-id=<id>` | Ads account id every row is scoped to. |
| `--country=<code>` | Marketplace, which also picks the reporting timezone. Default `US`. |
| `--merchbase-user-id=<mbu_…>` | Merchbase user the seeded account is granted to. Defaults to the shared Dev Sign-In user; pass your own to see this data as yourself instead. |

The seed applies pending Drizzle migrations before it writes, so a fresh local
database needs no separate migration step.

It prints a receipt: the database it wrote to, the canonical Merchbase
User the data is granted to, a row count per table, and the day the week runs
through. Nothing in it is a credential, and boot scripts must not swallow it —
a boot that silently seeded nothing and a boot that seeded a full week are
otherwise indistinguishable in a log.

## Authorization comes first

The seed and API startup call `createDevCloudflareAccess` from `@merchbaseco/access/dev` through the product projection store. This writes the fixed development person alias and canonical local grant. Both use `DEV_SIGN_IN_MERCHBASE_USER_ID`, which also owns the seeded account membership.

`NODE_ENV` must be exactly `development`, the lifecycle must not be production, and the database must be local. `getDatabaseConfig` runs the pure SDK target guard before constructing a connection or running migrations. The seed additionally applies its local-target guard. A newer local revoke cannot be overwritten by the fixed bootstrap version.

## Opening the dashboard

Development needs no identity provider or sign-in ticket. Open the loopback Vite URL; `/api` and realtime requests use its same-origin proxy. Any development port works. Cookie-authenticated writes and websocket upgrades require a loopback UI Origin. Production uses the Cloudflare interactive application and has no offline identity branch.

## It refuses anything but a local database

Local development runs against the **shared** database on the Mac mini over
Tailscale — that is what `.env.schema` resolves `BIDBEACON_DATABASE_HOST` to
outside production. "Not production" is therefore not a safe test for a script
that writes fabricated campaigns and spend.

The seed accepts only a loopback database host — `127.0.0.1`, `::1`, or
`localhost` — and refuses everything else with a loud error before it opens a
connection. `NODE_ENV=production` is refused too, even on loopback. There is no
override flag.

To seed, start a PostgreSQL on your machine and point the run at it:

```bash
BIDBEACON_DATABASE_HOST=127.0.0.1 BIDBEACON_DATABASE_PORT=5432 bun run db:seed:dev
```

Process environment outranks the schema, so the override applies to that run
only and nothing is written to disk.

## Cloud sessions

Cloud agents get all of it for free. `.agents/cloud/start.sh` provisions the
VM's own PostgreSQL, pins the database host to loopback for the session, and
seeds on every boot — receipt and all, straight into the boot log. Seeding is
per boot rather than baked into the environment snapshot because the dataset is
anchored to the current date, and a week-old snapshot would show a week-old
week. A failed seed logs and is skipped; it never blocks the session.

Cursor's `dev` terminal in `.cursor/environment.json` sets
`BIDBEACON_DEV_HOST=0.0.0.0` when it launches the dev servers, because Cursor forwards a session's ports by watching the VM for
listening sockets and the repository's loopback default is invisible to that
watcher. The API server already binds every interface, so it needs no
equivalent. See "Development-only knobs" in `docs/infrastructure.md`.

A boot therefore ends with a dashboard that opens signed in, on an account it
owns, showing this week.

Claude cloud sessions use the committed `.claude/settings.json` SessionStart
hook, scoped by `CLAUDE_CODE_REMOTE=true`. It runs `.agents/cloud/bootstrap.sh
claude`, which runs `.agents/cloud/install.sh` and
`start.sh` (the fleet loads separately, from the Claude environment's Setup
script) for the same loopback-only database and synthetic seed as Cursor. Running services are not
cached. The shared environment and credential flow live in the agents
repository's `docs/cloud-environments.md`.

The cloud dashboard uses the SDK's guarded local identity and makes no external
sign-in or ticket request. No identity-provider host needs to be added to the
Claude environment for dashboard sign-in.

The hook selects the fake Amazon Ads gateway. To start the app and capture
proof, invoke `/verify-bidbeacon`; `.claude/skills/verify-bidbeacon` exposes
the existing repository verification skill to Claude. Start and clean up app
processes through that skill rather than leaving a foreground server inside
a SessionStart hook. For a one-off screenshot of a running dashboard, use
`capture-page http://127.0.0.1:4174/ /tmp/bidbeacon.png --settle 8000`.
`capture-page` is the fleet's Playwright wrapper around the image's Chromium;
it routes external hosts through the agent proxy and keeps
loopback direct. Raw `chromium --screenshot` hangs against the Vite dev server.

## What the seed promises

`src/dev-seed/plan.test.ts` is the contract: it asserts the coverage this
document describes — every table filled, the state branches each surface renders
differently, a head and a long tail of spend, negatives that never accrue spend,
and a newest day that is always today. `src/dev-seed/seed-dev-data.integration-check.ts`
writes a plan into a PGlite Postgres through the real writer and then asks the
dashboard's own routers the questions the dashboard asks. Extend both when you
extend the dataset; a surface that is not asserted there will quietly stop being
seeded.
