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

. cloud-agent/env.sh
bash cloud-agent/session.sh

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
