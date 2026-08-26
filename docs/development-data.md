---
summary: What `bun run db:seed:dev` writes, its loopback-only refusal, and how cloud sessions get seeded.
read_when:
  - seeding a local database so the dashboard renders something
  - changing what the seed produces, which database it may touch, or how cloud sessions get it
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
| Account and access | One advertiser account for `US`, granted to a Merchbase user, with that account preselected. |
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
| `--merchbase-user-id=<mbu_…>` | Merchbase user the seeded account is granted to. Pass your own to see this data in the dashboard when you sign in. |

The seed applies pending Drizzle migrations before it writes, so a fresh local
database needs no separate migration step.

Re-running replaces the previous dataset rather than stacking a second one on
top: everything the last run wrote is cleared inside the same transaction that
refills it, so the week is refreshed, not duplicated. Account-scoped tables are
cleared by the seeded account; `api_metrics`, `ams_metrics`, and `job_metrics`
have no account column, so those rows carry a reserved id prefix and are cleared
by that. Nothing else in your local database is touched.

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

Cursor cloud agents get the data for free. `.cursor/start.sh` provisions the
VM's own PostgreSQL, pins the database host to loopback for the session, and
seeds on every boot. Seeding is per boot rather than baked into the environment
snapshot because the dataset is anchored to the current date, and a week-old
snapshot would show a week-old week. A failed seed logs and is skipped; it never
blocks the session.

## What the seed promises

`src/dev-seed/plan.test.ts` is the contract: it asserts the coverage this
document describes — every table filled, the state branches each surface renders
differently, a head and a long tail of spend, negatives that never accrue spend,
and a newest day that is always today. `src/dev-seed/seed-dev-data.integration-check.ts`
writes a plan into a PGlite Postgres through the real writer and then asks the
dashboard's own routers the questions the dashboard asks. Extend both when you
extend the dataset; a surface that is not asserted there will quietly stop being
seeded.
