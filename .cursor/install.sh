#!/usr/bin/env bash
# Idempotent repository bootstrap for BidBeacon Cursor cloud agents.
# Installs the system toolchain (PostgreSQL + Bun) if missing, then installs
# dependencies. There is no .env step: the committed .env.schema is the
# environment contract and values resolve from 1Password through the fleet-wide
# Development identity that Cursor injects as a Runtime Secret.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Pinned so `bunx varlock` behaves identically before node_modules exists.
VARLOCK_VERSION="1.16.1"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    SUDO="sudo"
fi

# --- System dependency: PostgreSQL --------------------------------------
# Local development on a MacBook reaches the production database over
# Tailscale. A cloud agent has no Tailscale, so it runs its own Postgres and
# start.sh points the schema's database host at loopback for that session.
if ! command -v psql >/dev/null 2>&1; then
    echo "[install] Installing PostgreSQL..."
    install_postgres() {
        $SUDO apt-get update -y -o Acquire::Retries=5
        $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y \
            -o Acquire::Retries=5 --fix-missing \
            postgresql postgresql-contrib
    }
    pg_installed=0
    for attempt in 1 2 3; do
        if install_postgres; then
            pg_installed=1
            break
        fi
        echo "[install] apt attempt ${attempt} failed; retrying in 5s..." >&2
        sleep 5
    done
    if [ "$pg_installed" -ne 1 ]; then
        echo "[install] ERROR: PostgreSQL installation failed after retries." >&2
        exit 1
    fi
else
    echo "[install] PostgreSQL already present."
fi

# --- System dependency: Bun (pinned by package.json packageManager) ------
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"
if ! command -v bun >/dev/null 2>&1; then
    echo "[install] Installing Bun 1.3.5..."
    curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.5"
    if ! grep -q 'BUN_INSTALL' "$HOME/.bashrc" 2>/dev/null; then
        printf '\nexport BUN_INSTALL="$HOME/.bun"\nexport PATH="$BUN_INSTALL/bin:$PATH"\n' >> "$HOME/.bashrc"
    fi
else
    echo "[install] Bun already present ($(bun --version))."
fi

# --- Install-time credentials -------------------------------------------
# Both are @internal schema items, so `varlock run` deliberately does not
# export them; they are fetched explicitly under the install switch and
# resolved from the Development vault via the Cursor fleet identity.
if [ -z "${MERCHBASE_GITHUB_NPM_TOKEN:-}" ]; then
    echo "[install] Resolving the GitHub Packages read token from 1Password..."
    MERCHBASE_GITHUB_NPM_TOKEN="$(
        BIDBEACON_RESOLVE_INSTALL_TOKENS=true \
        bunx "varlock@${VARLOCK_VERSION}" printenv MERCHBASE_GITHUB_NPM_TOKEN
    )"
    export MERCHBASE_GITHUB_NPM_TOKEN
fi
if [ -z "${MERCHBASE_GITHUB_NPM_TOKEN:-}" ]; then
    echo "[install] ERROR: MERCHBASE_GITHUB_NPM_TOKEN did not resolve; the private" \
        "@merchbaseco/access package cannot be installed." >&2
    exit 1
fi

# The licensed icon packages are optionalDependencies, so a missing key
# degrades to "no dashboard build" rather than a failed install.
if [ -z "${MERCHBASE_HUGEICONS_LICENSE_KEY:-}" ]; then
    MERCHBASE_HUGEICONS_LICENSE_KEY="$(
        BIDBEACON_RESOLVE_INSTALL_TOKENS=true \
        bunx "varlock@${VARLOCK_VERSION}" printenv MERCHBASE_HUGEICONS_LICENSE_KEY
    )" || true
    export MERCHBASE_HUGEICONS_LICENSE_KEY
fi

bun install --frozen-lockfile

# --- Shared agent skills (fleet dev environment parity) ---------------------
# Cursor discovers Agent Skills from .agents/skills in the checkout. Locally
# the operator's home-directory links already provide the fleet skill library;
# in the cloud VM it is seeded from the private agents repo, read with the
# fine-grained PAT that Cursor injects as the account-level Runtime Secret
# CURSOR_CLOUD_AGENTS_GH_READ_TOKEN. Agent tooling is not part of this
# repository's environment contract, so the PAT lives in Cursor's own secret
# store rather than in .env.schema, and nothing here touches varlock. The
# tarball fetch leaves no credential or git state on disk. Always refetched so
# snapshot reuse cannot pin a stale copy. Best-effort: every failure path logs
# and skips — seeding must never fail the install.
if [ -n "${CURSOR_CLOUD_AGENTS_GH_READ_TOKEN:-}" ]; then
    SKILLS_TMP="$(mktemp -d)" || SKILLS_TMP=""
    if [ -n "$SKILLS_TMP" ] &&
        curl -fsSL -H "Authorization: Bearer $CURSOR_CLOUD_AGENTS_GH_READ_TOKEN" \
            https://api.github.com/repos/zknicker/agents/tarball/main \
            | tar -xz -C "$SKILLS_TMP"; then
        SKILLS_SRC=""
        for SKILLS_CANDIDATE in "$SKILLS_TMP"/*/agents/skills; do
            if [ -d "$SKILLS_CANDIDATE" ]; then
                SKILLS_SRC="$SKILLS_CANDIDATE"
                break
            fi
        done
        if [ -n "$SKILLS_SRC" ] &&
            mkdir -p "$REPO_ROOT/.agents" &&
            rm -rf "$REPO_ROOT/.agents/skills" &&
            cp -R "$SKILLS_SRC" "$REPO_ROOT/.agents/skills"; then
            echo "[install] Seeded fleet agent skills into .agents/skills."
        else
            echo "[install] Skipping fleet agent skills (skills directory unavailable)." >&2
        fi
    else
        echo "[install] Skipping fleet agent skills (tarball fetch failed)." >&2
    fi
    rm -rf "$SKILLS_TMP" || true
else
    echo "[install] Skipping fleet agent skills (no read token)." >&2
fi

echo "[install] Done."
