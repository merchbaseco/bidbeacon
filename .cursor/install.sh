#!/usr/bin/env bash
# Idempotent dependency refresh for the BidBeacon Cloud Agent environment.
# Runs after the repository is checked out. Must terminate (no long-running processes).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BUN_VERSION="1.3.5"
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# --- bun (pinned to packageManager version) ---
if ! command -v bun >/dev/null 2>&1 || [ "$(bun --version 2>/dev/null || true)" != "$BUN_VERSION" ]; then
  curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
fi

# --- PostgreSQL 16 (the app's only local infra dependency) ---
if [ ! -x /usr/lib/postgresql/16/bin/postgres ]; then
  sudo apt-get update -o Acquire::Retries=5
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    -o Acquire::Retries=5 postgresql postgresql-client
fi

# --- initialize a local Postgres data dir (durable; started by start.sh) ---
PGDATA="$HOME/pgdata"
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  /usr/lib/postgresql/16/bin/initdb -D "$PGDATA" -U postgres --auth=trust
fi

# --- JS dependencies ---
# Requires MERCHBASE_NPM_TOKEN (GitHub Packages: @merchbaseco/access) and
# HUGEICONS_LICENSE_KEY (npm.hugeicons.com: @hugeicons-pro/*), injected as secrets.
bun install --frozen-lockfile

# --- local dev .env (only if absent; never clobber real injected secrets) ---
if [ ! -f .env ]; then
  cp .cursor/dev.env .env
fi
