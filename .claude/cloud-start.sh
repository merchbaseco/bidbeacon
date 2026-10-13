#!/usr/bin/env bash
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = true ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$root"

export BIDBEACON_DATABASE_HOST=127.0.0.1
export BIDBEACON_AMAZON_ADS_GATEWAY=fake
export PATH="$HOME/.local/bin:$PATH"

read_token="$(bunx varlock@1.16.1 printenv CLAUDE_FLEET_GITHUB_READ_TOKEN -p .claude/cloud-bootstrap)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
printf 'header = "Authorization: Bearer %s"\n' "$read_token" |
  curl --fail --silent --show-error --config - --max-time 60 \
    https://raw.githubusercontent.com/zknicker/agents/main/claude/cloud/fleet.tar.gz -o "$scratch/agents.tar.gz"
unset read_token
tar -xzf "$scratch/agents.tar.gz" -C "$scratch"
source_root="$scratch/agents"
test -f "$source_root/claude/cloud/seed.sh"

mkdir -p "$HOME/.agents"
previous="$HOME/.agents/claude-upstream-previous"
rm -rf "$previous"
if [ -d "$HOME/.agents/claude-upstream" ]; then
  mv "$HOME/.agents/claude-upstream" "$previous"
fi
mv "$source_root" "$HOME/.agents/claude-upstream"
bash "$HOME/.agents/claude-upstream/claude/cloud/seed.sh" >&2
rm -rf "$previous"

bash .cursor/install.sh >&2
bash scripts/cloud-postgres.sh >&2

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  printf '%s\n' \
    'export BIDBEACON_DATABASE_HOST=127.0.0.1' \
    'export BIDBEACON_AMAZON_ADS_GATEWAY=fake' \
    'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi

printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","reloadSkills":true,"additionalContext":"Claude cloud bootstrap loaded the current zknicker/agents fleet. Before work, read ~/.claude/CLAUDE.md and ~/.claude/rules/pstack-models.md. Use poteto-mode in this main chat and verify-bidbeacon for live verification. BidBeacon uses loopback PostgreSQL and the fake Amazon Ads gateway; launch the verification harness when needed. Fleet roles inherit the native Claude model."}}'
