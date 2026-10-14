#!/usr/bin/env bash
# Claude Code SessionStart adapter, cloud sessions only (CLAUDE_CODE_REMOTE=true).
# Fetches the zknicker/agents fleet, runs its Claude start script, then the
# shared cloud agent install and the loopback database. Only the hook JSON goes
# to stdout.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = true ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$root"

export BIDBEACON_DATABASE_HOST=127.0.0.1
export BIDBEACON_AMAZON_ADS_GATEWAY=fake
export PATH="$HOME/.local/bin:$PATH"

fleet_context="The zknicker/agents fleet did not load this session; fleet skills such as poteto-mode are unavailable."
if fleet_root="$(bash scripts/fetch-fleet.sh)" && context="$(bash "$fleet_root/claude/cloud/start.sh")"; then
  fleet_context="$context"
else
  echo "[session-start] Skipping fleet agents (fetch or start failed)." >&2
fi

bash scripts/cloud-agent-install.sh >&2
bash scripts/cloud-postgres.sh >&2

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  printf '%s\n' \
    'export BIDBEACON_DATABASE_HOST=127.0.0.1' \
    'export BIDBEACON_AMAZON_ADS_GATEWAY=fake' \
    'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi

product_context="Use verify-bidbeacon for live verification. BidBeacon uses loopback PostgreSQL and the fake Amazon Ads gateway; launch the verification harness when needed."
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","reloadSkills":true,"additionalContext":"%s %s"}}\n' "$fleet_context" "$product_context"
