---
summary: Environment contract, secret sources, delivery to the Mac mini stack, and the deploy path.
read_when:
  - adding, renaming, rotating, or removing an environment variable
  - changing compose, the Dockerfile, or the deploy workflow
  - debugging a value that is missing or wrong at runtime
---

# Infrastructure

BidBeacon runs as a Docker Compose stack on the Mac mini, behind Caddy on
`127.0.0.1:8091` and published at `https://bidbeacon.merchbase.co` through the
`mac-mini-srv` cloudflared tunnel. Four containers: `bidbeacon-server`,
`bidbeacon-worker`, `bidbeacon-caddy`, `bidbeacon-postgres`.

## The contract

`.env.schema` at the repo root is the only declaration of environment
variables: canonical names, explicit sensitivity, and per-lifecycle `op()`
references into 1Password. There is no `.env` step anywhere — not for
development, not for CI, not for deploys.

Names follow ownership. Credentials issued to this project are `BIDBEACON_*`;
credentials shared across the suite keep the issuing owner's prefix
(`MERCHBASE_*`) and resolve from the shared 1Password item rather than a copy.
`VITE_` prefixes are a platform requirement and carry the owner prefix after
them. Three names stay outside the schema entirely because the published
`@bidbeacon/cli` reads them on end users' machines: `MERCHBASE_API_KEY`,
`BB_BASE_URL`, and `BB_STORAGE_DIR`.

## Source to runtime

| Stage | How values arrive |
| --- | --- |
| Local development | `varlock run` resolves the Development vault through the 1Password desktop app, or the local-agents identity in the Keychain |
| CI (`Quality`) | Offline. `check:fast` pins `VARLOCK_ENV=test`, so every value is a fake-but-shaped literal and nothing contacts 1Password. Quality runs the fast lane only — see "Two lanes, on purpose" in `docs/testing.md` |
| CI install step | The deploy identity fills the schema's development slot; `varlock printenv` resolves the GitHub Packages read token under the install switch |
| Deploy | `scripts/deploy-with-varlock.ts` pins `VARLOCK_ENV=production`, resolves the Production vault, hands values to Compose as process environment, and ends with `docker image prune -f` so the rebuilt images do not leave dangling layers pooling on the Mac mini |
| Runtime | Compose bakes the resolved environment into each container at `up` time. The containers never contact 1Password |

Actions' own `github.token` is deliberately **not** used for package installs:
it cannot download another repository's GitHub Package unless that package
grants this repository access, so it is not a substitute for
`MERCHBASE_GITHUB_NPM_TOKEN`.

## Identities

Two, and only two:

- `GH_DEPLOY_AGENT_PRODUCTION_OP_TOKEN` — the single repository secret. Reads
  the Production and Development vaults. Fills both the production deploy slot
  and, in CI, the development slot used to resolve install credentials.
- `CURSOR_CLOUD_AGENTS_DEVELOPMENT_OP_TOKEN` — the fleet-wide Cursor Runtime
  Secret, account-scoped, not set per repo.

## Deploying

`Deploy Stack` is `workflow_dispatch` only. **Pushing to `main` no longer
deploys** — that changed with the migration, and it is deliberate now that a
deploy resolves production credentials.

```
gh workflow run "Deploy Stack" -R merchbaseco/bidbeacon --ref main
```

The workflow syncs `/Users/zknicker/srv/bidbeacon` to the dispatched commit and
runs `bun run deploy`. After `up`, `scripts/verify-deployed-secrets.ts`
name-diffs what Docker actually baked into the containers against the schema's
sensitivity split — a delivered name the schema does not declare is stale, and a
production-required sensitive item missing from a container is a failure.

For a local check that every `op()` reference resolves without shipping
anything: `bun run deploy:dry-run`.

## Two traps this stack has already hit

**A `.env` in the deploy checkout silently overrides the schema.** Varlock loads
a project `.env` at higher precedence than `.env.schema`. The legacy file on the
mini held the database password `$$`-escaped for Compose; varlock parsed the `$`
as a `ref()` expression, delivered the password truncated at its first `$`, and —
because one failed parse poisons the whole file — reported "Unable to
authenticate with 1Password" for every other `op()` reference. The server could
not authenticate to Postgres and production went down. The host file is now
`/Users/zknicker/srv/bidbeacon/.env.superseded`, and
`scripts/deploy-with-varlock.ts` refuses to run when a `.env` exists in the
checkout.

**Compose interpolates the values it substitutes.** `${VAR}` truncates any value
containing a `$`. Every same-named entry in `compose.yml` therefore uses the
pass-through shorthand (`- BIDBEACON_DATABASE_PASSWORD`), which Compose reads
from the process environment verbatim. The three `POSTGRES_*` names still
interpolate because the image demands those literal names; they are consumed
only when the data volume is first initialised, so if that volume is ever
recreated, give the database a `$`-free password first.

## Development-only knobs

Two schema items exist to make a fresh checkout — a worktree, or a cloud VM
that has never seen the product — boot into something worth looking at. Neither
is delivered to any container, and both are listed as deliberately undelivered
in `scripts/env-contract-check.ts`.

`BIDBEACON_DEV_HOST` is the dashboard dev server's bind address, and
`vite.config.dashboard.ts` is its only reader. It defaults to `127.0.0.1`, which
keeps a dev server — and the synthetic seed data behind it — off the network.
An environment that reaches the server through a port forwarder sets `0.0.0.0`
for its own dev command, because such forwarders find a session's ports by
watching for listening sockets and a loopback-only bind is invisible to them.
`.cursor/start.sh` exports exactly that, which is where the knowledge that
Cursor works this way belongs; app code stays vendor-neutral. Only the socket
widens — the app still believes it serves its own origin. The API server needs
no equivalent because `src/index.ts` already listens on `0.0.0.0`.

It is deliberately **not** internal-marked. Varlock strips internal-marked items
from the environment it hands a `varlock run` child even when the parent shell
exported one, so an internal-marked knob could never reach the dev server it
configures.

`BIDBEACON_DEV_CLERK_SIGN_IN_USER_ID` is the Clerk User the development
dashboard signs in as automatically — the shared Merchbase Dev Sign-In user. It
is an opaque development-instance identifier rather than a credential, so it is
committed on purpose: an ephemeral checkout has to be correct without vault
access. It resolves to nothing in production, and the endpoint that mints
tickets for it (`dev.createClerkSignInToken`) independently refuses
`NODE_ENV=production` — which the Dockerfile sets — and any non-loopback `Host`.
See `docs/development-data.md`.

Because the parties in `BIDBEACON_CLERK_AUTHORIZED_PARTIES` are matched exactly
against a token's `azp`, the development arm lists both loopback spellings of
each dev-server port: `BIDBEACON_DEV_HOST` decides which one Vite prints, and a
session opened on the other one would otherwise be rejected.

## Adding a variable

Declare it in `.env.schema` with an explicit `@sensitive` or `@public`, a `test`
arm, and per-lifecycle `op()` references. Add it to the `environment:` list of
each service that reads it, or — for a development-only knob no container may
have — add it to `notDeliveredNames` in `scripts/env-contract-check.ts` with the
reason. Run `bun run env:contract`, which fails if the schema, the source's
`process.env` reads, the Compose delivery, and the Dockerfile `ARG`s disagree.
It is wired into `check`.

One parser trap: that check reads a variable's decorators out of the comment
block above it, by substring. Writing `@internal` in prose above an item — even
to say it is *not* internal — marks it internal and drops it out of the
deliverable set.
