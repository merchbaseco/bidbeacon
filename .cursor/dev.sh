#!/usr/bin/env bash
# Long-running dev server terminal: API server (:8080) + dashboard (:4173).
set -euo pipefail

export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The Cloud Agent injects database connection secrets that point at the
# production database (reachable only over Tailscale). dotenv-cli does not
# override variables already present in the environment, so those injected
# values would otherwise win over .env. Force the connection host/port to the
# local Postgres started by start.sh so local dev never talks to production
# (the dev server runs migrations and startup writes on boot). The database
# name/user resolve to the local instance and it uses trust auth locally.
export BIDBEACON_DATABASE_HOST=127.0.0.1 # pragma: allowlist secret
export BIDBEACON_DATABASE_PORT=5432 # pragma: allowlist secret

exec bun run dev
