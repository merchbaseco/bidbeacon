#!/usr/bin/env bash
# Long-running dev server terminal: API server (:8080) + dashboard (:4173).
set -euo pipefail

export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bun run dev
