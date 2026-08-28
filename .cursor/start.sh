#!/usr/bin/env bash
# Per-boot startup for BidBeacon Cursor cloud agents.
# Starts the local PostgreSQL cluster, ensures the role/database exist using the
# credential the schema resolves, refills the database with synthetic
# development data, then launches the development servers under varlock.
# Idempotent and safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    SUDO="sudo"
fi

PG_CLUSTER="$(ls -d /etc/postgresql/*/main 2>/dev/null | head -1 || true)"
PG_VERSION="$(basename "$(dirname "${PG_CLUSTER:-/16/main}")")"

if ! $SUDO pg_ctlcluster "$PG_VERSION" main status >/dev/null 2>&1; then
    $SUDO pg_ctlcluster "$PG_VERSION" main start
fi

for _ in $(seq 1 30); do
    if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# The schema points development at the Mac mini's Postgres over Tailscale,
# which a cloud agent cannot reach. Override the host for this session only —
# process env wins over the schema, and nothing is written to disk.
export BIDBEACON_DATABASE_HOST=127.0.0.1

# The database password is a schema item, so the local cluster is provisioned
# with the same value the server will resolve — one owner, no drift. The value
# moves through a pipe into psql and is never printed.
DB_USER="$(bunx varlock printenv BIDBEACON_DATABASE_USER)"
DB_NAME="$(bunx varlock printenv BIDBEACON_DATABASE_NAME)"
DB_PASSWORD="$(bunx varlock printenv BIDBEACON_DATABASE_PASSWORD)"

$SUDO -u postgres psql -p 5432 -v ON_ERROR_STOP=1 \
    -v db_user="$DB_USER" -v db_name="$DB_NAME" -v db_password="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE USER %I WITH PASSWORD %L', :'db_user', :'db_password')
    WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'db_user')\gexec
SELECT format('ALTER USER %I WITH PASSWORD %L', :'db_user', :'db_password')\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name')\gexec
SQL

# Extensions are created here, as the postgres superuser, so the application
# role stays ordinary. Migration 0000 runs `CREATE EXTENSION IF NOT EXISTS
# pg_stat_statements`, which an ordinary role cannot execute ("Must be
# superuser to create this extension") — but once the extension exists the
# statement is a no-op notice, so server startup migrations succeed.
#
# The extension is created but not preloaded: querying its view needs
# `shared_preload_libraries`, which only the production compose stack sets.
# Nothing in the application reads it — it is a manual query-cost analysis tool
# — so a cloud agent needs the extension present, not functional.
$SUDO -u postgres psql -p 5432 -d "$DB_NAME" -v ON_ERROR_STOP=1 -v db_user="$DB_USER" <<'SQL'
SELECT format('ALTER SCHEMA public OWNER TO %I', :'db_user')\gexec
SELECT format('GRANT ALL ON SCHEMA public TO %I', :'db_user')\gexec
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SQL

unset DB_PASSWORD

echo "[start] PostgreSQL ready on 127.0.0.1:5432 (database: ${DB_NAME})."

# Synthetic development data, so a cloud session opens a dashboard with
# campaigns, a week of performance, and an event stream instead of empty
# states. The seed applies pending migrations first, bootstraps the Access
# Projection the shared Dev Sign-In user is authorized through, then clears and
# refills its own account. Seeded per boot rather than baked into the
# environment snapshot, because the dataset is anchored to the current date and
# a week-old snapshot would show a week-old week. It can only ever reach this
# cluster: the seed refuses any database host that is not loopback, and
# BIDBEACON_DATABASE_HOST is pinned to 127.0.0.1 above. Best-effort — a session
# must still boot if seeding fails.
#
# Its receipt goes to this log verbatim. A boot that silently seeded nothing
# and a boot that seeded a full week used to look identical here; now the log
# names the database, the user the data is granted to, the row counts, and the
# day the week runs through. The receipt contains no credential — the sign-in
# ticket the dashboard later exchanges is minted per request and never printed.
echo "[start] Seeding synthetic development data..."
if ! bunx varlock run -- bunx tsx scripts/seed-dev-data.ts; then
    echo "[start] Skipping synthetic dev data (seed failed)." >&2
fi

root="$REPO_ROOT"

# Fleet agents. Fetch on every boot so a reused snapshot cannot pin a stale copy.
if [ -n "${CURSOR_CLOUD_AGENTS_GH_READ_TOKEN:-}" ]; then
  agents_tmp="$(mktemp -d)" || agents_tmp=""
  if [ -n "$agents_tmp" ] &&
    curl -fsSL -H "Authorization: Bearer $CURSOR_CLOUD_AGENTS_GH_READ_TOKEN" \
      https://api.github.com/repos/zknicker/agents/tarball/main \
      | tar -xz -C "$agents_tmp"; then
    agents_src=""
    for agents_candidate in "$agents_tmp"/*; do
      if [ -f "$agents_candidate/cursor/setup.sh" ]; then
        agents_src="$agents_candidate"
        break
      fi
    done
    if [ -n "$agents_src" ]; then
      rm -rf "$HOME/.agents/upstream"
      mkdir -p "$HOME/.agents"
      mv "$agents_src" "$HOME/.agents/upstream"
      if bash "$HOME/.agents/upstream/cursor/setup.sh" \
        --skills "$HOME/.agents/skills" \
        --rules "$HOME/.cursor/rules" \
        --plugin-local "$HOME/.cursor/plugins/local" &&
        bash "$HOME/.agents/upstream/cursor/setup.sh" \
          --skills "$root/.agents/skills"; then
        echo "[start] Seeded fleet agents from zknicker/agents."
      else
        echo "[start] Skipping fleet agents (setup.sh failed)." >&2
      fi
    else
      echo "[start] Skipping fleet agents (setup.sh missing)." >&2
    fi
  else
    echo "[start] Skipping fleet agents (tarball fetch failed)." >&2
  fi
  rm -rf "$agents_tmp" || true
else
  echo "[start] Skipping fleet agents (no read token)." >&2
fi

# Cursor forwards a session's ports by watching the VM for listening sockets,
# and the repository's loopback default is invisible to that watcher. Widening
# the dashboard's bind is a property of this environment, not of the app, so it
# is exported here rather than detected in vite.config.dashboard.ts. The API
# server already binds every interface, so it needs no equivalent.
export BIDBEACON_DEV_HOST=0.0.0.0

echo "[start] Launching development servers (api:8080 on 0.0.0.0, dashboard:4173 on ${BIDBEACON_DEV_HOST})..."

exec bunx varlock run -- node_modules/.bin/concurrently -k -n server,dashboard -c cyan,magenta \
    "bunx tsx src/index.ts" \
    "bunx vite dev --config vite.config.dashboard.ts"
