#!/usr/bin/env bash
# Per-boot startup for BidBeacon Cursor cloud agents.
# Starts the local PostgreSQL cluster, ensures the role/database exist using the
# credential the schema resolves, then launches the development servers under
# varlock. Idempotent and safe to re-run.
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

$SUDO -u postgres psql -p 5432 -d "$DB_NAME" -v ON_ERROR_STOP=1 -v db_user="$DB_USER" <<'SQL'
SELECT format('ALTER SCHEMA public OWNER TO %I', :'db_user')\gexec
SELECT format('GRANT ALL ON SCHEMA public TO %I', :'db_user')\gexec
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SQL

unset DB_PASSWORD

echo "[start] PostgreSQL ready on 127.0.0.1:5432 (database: ${DB_NAME})."
echo "[start] Launching development servers (api:8080, dashboard:4173)..."

exec bunx varlock run -- node_modules/.bin/concurrently -k -n server,dashboard -c cyan,magenta \
    "bunx tsx src/index.ts" \
    "bunx vite dev --config vite.config.dashboard.ts"
