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

It prints a receipt: the database it wrote to, the Clerk subject and Merchbase
User the data is granted to, a row count per table, and the day the week runs
through. Nothing in it is a credential, and boot scripts must not swallow it —
a boot that silently seeded nothing and a boot that seeded a full week are
otherwise indistinguishable in a log.

## Authorization comes first

BidBeacon authorizes every request against an Access Projection held in its own
database and kept current by a signed Clerk webhook. No webhook is ever
delivered to a developer's machine or a cloud VM, so a freshly migrated local
database has no projection at all and every request fails before a single seeded
campaign can be seen. Seeded data without a projection is invisible data.

So the first thing the seed does, before any product row, is call
`bootstrapDevAccessProjection` from `@merchbaseco/access/dev`. The shared package
writes the projection the webhook would have written — the exact metadata the
development Clerk User carries — through this repo's own
`AccessProjectionStore` adapter and the same `apply` upsert the webhook route
uses. No projection SQL lives in this repository, and there is no override flag.

Two things have to line up, and the bootstrap refuses if they do not:

- The **issuer** must be byte-identical to the one
  `createClerkAuthenticator` is given in
  `src/services/access/bidbeacon-access.ts`. Both read
  `MERCHBASE_CLERK_ISSUER`; a projection is keyed by `(issuer, subject)`, so an
  issuer differing by a character writes a row no session will ever match.
- The **database** must be loopback, and `NODE_ENV` must not be `production`.
  The bootstrap checks both itself, on top of the seed's own refusal.

The seeded account is granted to `DEV_SIGN_IN_MERCHBASE_USER_ID` — the same
constant, imported rather than copied, so the signed-in user and the data owner
cannot drift apart.

If it fails with a `DevAccessBootstrapError` saying a newer projection event
already owns the subject, some other event — a real webhook, or a hand-written
row — has claimed it with a later source timestamp. The projection is
monotonic by design and the bootstrap will never mask a revocation. Clear the
local projection and re-seed:

```sql
DELETE FROM access_projection_event;
DELETE FROM access_projection;
```

## Signing in without a password

A cloud agent has no password to type, and a dashboard that opens on a sign-in
form has wasted the week of data behind it. In development the dashboard signs
itself in as the shared Merchbase Dev Sign-In user on load.

`src/dashboard/components/dev-auto-sign-in.tsx` asks the server for a one-minute
Clerk sign-in ticket and exchanges it for a session through `useSignIn`. The
ticket is handled in memory and never written to the URL, so it cannot end up in
browser history, a referrer header, or a proxy access log. Nothing logs it.

`dev.createClerkSignInToken` mints it, and refuses three ways, deliberately not
one gate:

1. `NODE_ENV=production` — the Dockerfile sets it, so the shipped image refuses
   before reading anything else.
2. `BIDBEACON_DEV_CLERK_SIGN_IN_USER_ID` unset — production resolves it to
   nothing, so there is no user to mint for.
3. A non-loopback `Host` header. A dev server reached through a port forwarder
   still presents `localhost` upstream; anything addressing the server by a real
   name is refused.

The procedure is mounted on the dashboard's private app router rather than under
`api.*`, so it never reaches the published `@bidbeacon/http-client` surface.
`src/api/dev/create-clerk-sign-in-token.test.ts` drives the gate directly.

The client half is compiled out of a production bundle: `import.meta.env.DEV` is
statically false in a `vite build`, so the fetch and the exchange are dead code
the bundler drops.

For the same reason a dev dashboard talks to **its own origin** rather than the
production one: `/api` lands on the Vite proxy and from there on
`BIDBEACON_DASHBOARD_API_PROXY_TARGET`, which is the local server in front of
the database that was just seeded. Reaching past it to
`bidbeacon.merchbase.co` would show a cloud session an empty dashboard it holds
no session for.

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

Cursor cloud agents get all of it for free. `.cursor/start.sh` provisions the
VM's own PostgreSQL, pins the database host to loopback for the session, and
seeds on every boot — receipt and all, straight into the boot log. Seeding is
per boot rather than baked into the environment snapshot because the dataset is
anchored to the current date, and a week-old snapshot would show a week-old
week. A failed seed logs and is skipped; it never blocks the session.

The same script exports `BIDBEACON_DEV_HOST=0.0.0.0` before launching the dev
servers, because Cursor forwards a session's ports by watching the VM for
listening sockets and the repository's loopback default is invisible to that
watcher. The API server already binds every interface, so it needs no
equivalent. See "Development-only knobs" in `docs/infrastructure.md`.

A boot therefore ends with a dashboard that opens signed in, on an account it
owns, showing this week.

## What the seed promises

`src/dev-seed/plan.test.ts` is the contract: it asserts the coverage this
document describes — every table filled, the state branches each surface renders
differently, a head and a long tail of spend, negatives that never accrue spend,
and a newest day that is always today. `src/dev-seed/seed-dev-data.integration-check.ts`
writes a plan into a PGlite Postgres through the real writer and then asks the
dashboard's own routers the questions the dashboard asks. Extend both when you
extend the dataset; a surface that is not asserted there will quietly stop being
seeded.
