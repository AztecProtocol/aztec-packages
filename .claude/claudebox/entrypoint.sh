#!/usr/bin/env bash
# claudeentry.sh - Entry point for ClaudeBox SSH sessions
#
# Usage: claudeentry.sh <script-name> [args...] [--comment-id=<id>] [--repo=<owner/repo>]
#
# Starts Claude in an isolated worktree, streams session output,
# and cleans up on exit.

set -euo pipefail

REPO_DIR="${CLAUDE_REPO_DIR:-$HOME/aztec-packages}"

# ── Parse arguments ──────────────────────────────────────────────
SCRIPT_NAME=""
COMMENT_ID=""
RUN_COMMENT_ID=""
REPO=""

for arg in "$@"; do
    case "$arg" in
        --comment-id=*)
            COMMENT_ID="${arg#--comment-id=}"
            ;;
        --run-comment-id=*)
            RUN_COMMENT_ID="${arg#--run-comment-id=}"
            ;;
        --repo=*)
            REPO="${arg#--repo=}"
            ;;
        *)
            if [ -z "$SCRIPT_NAME" ]; then
                SCRIPT_NAME="$arg"
            fi
            ;;
    esac
done

if [ -z "$SCRIPT_NAME" ]; then
    echo "ERROR: No script name provided" >&2
    echo "Usage: claudeentry.sh <script-name> [--comment-id=<id>] [--repo=<owner/repo>]" >&2
    echo "Prompt is read from stdin." >&2
    exit 1
fi

# Read prompt from stdin (piped from GHA workflow)
USER_PROMPT=""
if [ ! -t 0 ]; then
    USER_PROMPT=$(cat)
fi

# ── Update repo ──────────────────────────────────────────────────
cd "$REPO_DIR"
git fetch origin --quiet 2>/dev/null || true

# ── Validate script exists ───────────────────────────────────────
SCRIPT_FILE="$REPO_DIR/.claude/scripts/$SCRIPT_NAME"
if [ ! -f "$SCRIPT_FILE" ]; then
    echo "ERROR: Script not found: .claude/scripts/$SCRIPT_NAME" >&2
    echo "Available scripts:" >&2
    ls "$REPO_DIR/.claude/scripts/" 2>/dev/null | grep -v '\.py$' >&2 || echo "  (none)" >&2
    exit 1
fi

# ── Build prompt ─────────────────────────────────────────────────
PROMPT=$(cat "$SCRIPT_FILE")

# Append user prompt if provided
if [ -n "$USER_PROMPT" ]; then
    PROMPT="$PROMPT

User request: $USER_PROMPT"
fi

# Add metadata
PROMPT="$PROMPT

---
Metadata:
- Comment ID: ${COMMENT_ID:-none}
- Run Comment ID: ${RUN_COMMENT_ID:-none}
- Repository: ${REPO:-none}
- Script: $SCRIPT_NAME"

# ── Generate worktree name ───────────────────────────────────────
TIMESTAMP=$(date +%s)
if [ -n "$COMMENT_ID" ]; then
    WORKTREE_NAME="bot-${COMMENT_ID}-${TIMESTAMP}"
else
    WORKTREE_NAME="bot-local-${TIMESTAMP}"
fi

# ── Set up environment ────────────────────────────────────────────
WORKTREE_PATH="$REPO_DIR/.claude/worktrees/$WORKTREE_NAME"
export CLAUDE_WORKTREE_PATH="$WORKTREE_PATH"
export CLAUDE_REPO_DIR="$REPO_DIR"
# GH_TOKEN must be set in the environment (e.g. in ~/claudeentry.sh on the box)
export GITHUB_TOKEN="${GH_TOKEN:-}"

# ── Cleanup on exit ──────────────────────────────────────────────
STREAM_PID=""
cleanup() {
    local exit_code=$?
    echo ""
    echo "━━━ Cleanup ━━━"

    # Kill streamer
    if [ -n "$STREAM_PID" ] && kill -0 "$STREAM_PID" 2>/dev/null; then
        kill "$STREAM_PID" 2>/dev/null || true
        wait "$STREAM_PID" 2>/dev/null || true
    fi

    # Remove worktree
    if [ -d "$WORKTREE_PATH" ]; then
        echo "Removing worktree: $WORKTREE_NAME"
        cd "$REPO_DIR"
        git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
        git branch -D "worktree-$WORKTREE_NAME" 2>/dev/null || true
    fi

    echo "Exit code: $exit_code"
    exit "$exit_code"
}
trap cleanup EXIT

# ── Print header ─────────────────────────────────────────────────
echo "━━━ ClaudeBox Starting ━━━"
echo "Script:    $SCRIPT_NAME"
echo "Prompt:    ${USER_PROMPT:-<none>}"
echo "Worktree:  $WORKTREE_NAME"
echo "Comment:   ${COMMENT_ID:-<local>}"
echo "Repo:      ${REPO:-<local>}"
echo ""

# ── Start session streamer in background ─────────────────────────
bash "$REPO_DIR/.claude/claudebox/stream-session.sh" "$WORKTREE_NAME" &
STREAM_PID=$!

# ── Start Claude (foreground, streamer runs alongside) ───────────
# Allow running inside another Claude session (local testing)
unset CLAUDECODE 2>/dev/null || true

# NOTE: We run this in a sandboxed environment with appropriately-scoped permissions.
DANGEROUS_FLAGS=--dangerously-skip-permissions

# Don't error our on bad exit code
set +e
claude \
    --print \
    --worktree "$WORKTREE_NAME" \
    $DANGEROUS_FLAGS \
    -p "$PROMPT"
CLAUDE_EXIT=$?
set -e

# Give streamer a moment to catch final output
sleep 2

echo ""
echo "━━━ Claude exited with code: $CLAUDE_EXIT ━━━"
exit "$CLAUDE_EXIT"
