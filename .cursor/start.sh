#!/usr/bin/env bash
# Per-boot reconciliation: bring up local Postgres and ensure the app role/db.
# Must be idempotent, avoid duplicate processes, check readiness, then return.
set -euo pipefail

PGBIN=/usr/lib/postgresql/16/bin
PGDATA="$HOME/pgdata"

# Start Postgres only if it is not already running.
if ! "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/logfile" -o "-p 5432 -k /tmp" -w start
fi

# Wait for readiness.
for _ in $(seq 1 30); do
  if "$PGBIN/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Ensure the bidbeacon role and database exist (idempotent).
if ! "$PGBIN/psql" -h /tmp -p 5432 -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='bidbeacon'" | grep -q 1; then
  "$PGBIN/psql" -h /tmp -p 5432 -U postgres -c "CREATE ROLE bidbeacon WITH LOGIN SUPERUSER PASSWORD 'bidbeacon';"
fi
if ! "$PGBIN/psql" -h /tmp -p 5432 -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='bidbeacon'" | grep -q 1; then
  "$PGBIN/psql" -h /tmp -p 5432 -U postgres -c "CREATE DATABASE bidbeacon OWNER bidbeacon;"
fi
