#!/usr/bin/env bash
# BidBeacon per-session services (repo-owned part of the fleet cloud agent
# contract): the loopback PostgreSQL cluster and its synthetic seed.
set -euo pipefail

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
export BIDBEACON_DATABASE_HOST=127.0.0.1
if [ "$(id -u)" -eq 0 ]; then
    privileged=()
    as_postgres=(runuser -u postgres --)
else
    privileged=(sudo)
    as_postgres=(sudo -u postgres)
fi

PG_CLUSTER="$(ls -d /etc/postgresql/*/main 2>/dev/null | head -1 || true)"
PG_VERSION="$(basename "$(dirname "${PG_CLUSTER:-/16/main}")")"

if ! "${privileged[@]}" pg_ctlcluster "$PG_VERSION" main status >/dev/null 2>&1; then
    "${privileged[@]}" pg_ctlcluster "$PG_VERSION" main start
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

"${as_postgres[@]}" psql -p 5432 -v ON_ERROR_STOP=1 \
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
"${as_postgres[@]}" psql -p 5432 -d "$DB_NAME" -v ON_ERROR_STOP=1 -v db_user="$DB_USER" <<'SQL'
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

