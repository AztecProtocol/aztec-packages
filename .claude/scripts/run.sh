#!/usr/bin/env bash
# run.sh — Shared script runner. Sourced by each script to build the prompt
# and call entrypoint.sh.
#
# Usage (in a script):
#   read -r -d '' TEMPLATE <<'EOF' || true
#   Your prompt template here...
#   EOF
#   source "$(dirname "$0")/run.sh" "$@"
#
# The script can be invoked as:
#   ./new-pr "implement feature X"                          # local
#   ./new-pr --slack-channel=C123 <<< "implement feature X" # from slack

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"
script_name="$(basename "${BASH_SOURCE[1]}")"

# ── Parse args: first non-flag arg is user prompt, rest are flags ──
user_prompt=""
flags=()
for arg in "$@"; do
    case "$arg" in
        --*) flags+=("$arg") ;;
        *)   [ -z "$user_prompt" ] && user_prompt="$arg" ;;
    esac
done

# Read from stdin if not a tty (e.g., piped from slack listener)
if [ ! -t 0 ]; then
    stdin_input=$(cat)
    [ -n "$stdin_input" ] && user_prompt="$stdin_input"
fi

# ── Build full prompt ──────────────────────────────────────────────
prompt=""
common="$REPO_DIR/.claude/scripts/common.md"
[ -f "$common" ] && prompt="$(cat "$common")

---

"
prompt="$prompt${TEMPLATE:-}"

if [ -n "$user_prompt" ]; then
    prompt="$prompt

User request: $user_prompt"
fi

# ── Call entrypoint ────────────────────────────────────────────────
printf '%s' "$prompt" | "$REPO_DIR/.claude/claudebox/entrypoint.sh" "$script_name" "${flags[@]+"${flags[@]}"}"
