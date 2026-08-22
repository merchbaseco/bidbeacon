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
| CI (`Quality`) | Offline. `check` pins `VARLOCK_ENV=test`, so every value is a fake-but-shaped literal and nothing contacts 1Password |
| CI install step | The deploy identity fills the schema's development slot; `varlock printenv` resolves the GitHub Packages read token under the install switch |
| Deploy | `scripts/deploy-with-varlock.ts` pins `VARLOCK_ENV=production`, resolves the Production vault, and hands values to Compose as process environment |
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

## Adding a variable

Declare it in `.env.schema` with an explicit `@sensitive` or `@public`, a `test`
arm, and per-lifecycle `op()` references. Add it to the `environment:` list of
each service that reads it. Run `bun run env:contract`, which fails if the
schema, the source's `process.env` reads, the Compose delivery, and the
Dockerfile `ARG`s disagree. It is wired into `check`.
