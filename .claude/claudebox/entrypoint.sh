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
SLACK_CHANNEL=""
SLACK_THREAD_TS=""
SLACK_MESSAGE_TS=""
USER_NAME=""

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
        --slack-channel=*)
            SLACK_CHANNEL="${arg#--slack-channel=}"
            ;;
        --slack-thread-ts=*)
            SLACK_THREAD_TS="${arg#--slack-thread-ts=}"
            ;;
        --slack-message-ts=*)
            SLACK_MESSAGE_TS="${arg#--slack-message-ts=}"
            ;;
        --user=*)
            USER_NAME="${arg#--user=}"
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
COMMON_FILE="$REPO_DIR/.claude/scripts/common.md"
PROMPT=""
if [ -f "$COMMON_FILE" ]; then
    PROMPT=$(cat "$COMMON_FILE")
    PROMPT="$PROMPT

---

"
fi
PROMPT="$PROMPT$(cat "$SCRIPT_FILE")"

# Append user prompt if provided
if [ -n "$USER_PROMPT" ]; then
    PROMPT="$PROMPT

User request: $USER_PROMPT"
fi

# Add metadata
PROMPT="$PROMPT

---
Metadata (GitHub):
- Comment ID: ${COMMENT_ID:-none}
- Run Comment ID: ${RUN_COMMENT_ID:-none}
- Repository: ${REPO:-none}

Metadata (Slack):
- Channel: ${SLACK_CHANNEL:-none}
- Thread TS: ${SLACK_THREAD_TS:-none}
- Message TS: ${SLACK_MESSAGE_TS:-none}

Script: $SCRIPT_NAME"

# ── Generate worktree name ───────────────────────────────────────
TIMESTAMP=$(date +%s)
if [ -n "$COMMENT_ID" ]; then
    WORKTREE_NAME="bot-gh-${COMMENT_ID}-${TIMESTAMP}"
elif [ -n "$SLACK_CHANNEL" ]; then
    WORKTREE_NAME="bot-slack-${TIMESTAMP}"
else
    WORKTREE_NAME="bot-local-${TIMESTAMP}"
fi

# ── Set up environment ────────────────────────────────────────────
WORKTREE_PATH="$REPO_DIR/.claude/worktrees/$WORKTREE_NAME"
export CLAUDE_WORKTREE_PATH="$WORKTREE_PATH"
export CLAUDE_REPO_DIR="$REPO_DIR"
# GH_TOKEN must be set in the environment (e.g. in ~/claudeentry.sh on the box)
export GITHUB_TOKEN="${GH_TOKEN:-}"
export SLACK_BOT_TOKEN="${SLACK_BOT_TOKEN:-}"

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

# ── Set up cache_log for non-GHA runs ────────────────────────────
# When not running in GitHub Actions, pipe output through ci3/cache_log
# to get a live log URL (http://ci.aztec-labs.com/<id>).
LOG_ID=""
USE_CACHE_LOG=0
if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
    # Source ci3 to get uuid function and redis setup
    NO_CD=1 source "$REPO_DIR/ci3/source" || true
    source "$REPO_DIR/ci3/source_redis" || true
    echo "Redis available: ${CI_REDIS_AVAILABLE:-0}" >&2
    if [ "${CI_REDIS_AVAILABLE:-0}" -eq 1 ]; then
        LOG_ID=$(head -c 16 /dev/urandom | xxd -p)
        USE_CACHE_LOG=1
        LOG_URL="http://ci.aztec-labs.com/$LOG_ID"
        echo "Log URL: $LOG_URL" >&2

        # Update Slack status message with the log link
        if [ -n "$SLACK_CHANNEL" ] && [ -n "$SLACK_MESSAGE_TS" ] && [ -n "${SLACK_BOT_TOKEN:-}" ]; then
            curl -s -X POST -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
                -H "Content-type: application/json" \
                "https://slack.com/api/chat.update" \
                -d "{\"channel\":\"$SLACK_CHANNEL\",\"ts\":\"$SLACK_MESSAGE_TS\",\"text\":\"ClaudeBox is running \`$SCRIPT_NAME\`... <$LOG_URL|View live log>\"}" \
                >/dev/null 2>&1 || true
        fi
    fi
fi
export LOG_URL="${LOG_URL:-}"

# Append log URL to prompt if available
if [ -n "$LOG_URL" ]; then
    PROMPT="$PROMPT

Log URL: $LOG_URL"
fi

# ── Print header ─────────────────────────────────────────────────
echo "━━━ ClaudeBox Starting ━━━"
echo "Script:    $SCRIPT_NAME"
echo "Prompt:    ${USER_PROMPT:-<none>}"
echo "Worktree:  $WORKTREE_NAME"
echo "Comment:   ${COMMENT_ID:-<local>}"
echo "Repo:      ${REPO:-<local>}"
[ -n "$LOG_URL" ] && echo "Log:       $LOG_URL"
echo ""

# ── Start session streamer in background ─────────────────────────
bash "$REPO_DIR/.claude/claudebox/stream-session.sh" "$WORKTREE_NAME" &
STREAM_PID=$!

# ── Start Claude in tmux (or foreground for GHA) ─────────────────
# Allow running inside another Claude session (local testing)
unset CLAUDECODE 2>/dev/null || true

# NOTE: We run this in a sandboxed environment with appropriately-scoped permissions.
DANGEROUS_FLAGS=--dangerously-skip-permissions

# Session name for tmux (LOG_ID if available, else worktree name)
TMUX_SESSION="${LOG_ID:-$WORKTREE_NAME}"

# Write prompt to a temp file (avoids shell quoting issues in tmux)
PROMPT_FILE="/tmp/claudebox-prompt-$$"
EXIT_FILE="/tmp/claudebox-exit-$$"
printf '%s' "$PROMPT" > "$PROMPT_FILE"

# Build a wrapper script for tmux (avoids nested quoting hell)
RUNNER_SCRIPT="/tmp/claudebox-run-$$.sh"
cat > "$RUNNER_SCRIPT" <<RUNEOF
#!/usr/bin/env bash
export PATH="$PATH"
set -uo pipefail
PROMPT=\$(cat "$PROMPT_FILE")
claude --print --worktree "$WORKTREE_NAME" $DANGEROUS_FLAGS -p "\$PROMPT"
CLAUDE_EXIT=\$?
echo "\$CLAUDE_EXIT" > "$EXIT_FILE"
exit \$CLAUDE_EXIT
RUNEOF

RUNNER_SCRIPT_CACHELOG="/tmp/claudebox-run-cachelog-$$.sh"
cat > "$RUNNER_SCRIPT_CACHELOG" <<RUNEOF
#!/usr/bin/env bash
export PATH="$PATH"
set -uo pipefail
PROMPT=\$(cat "$PROMPT_FILE")
claude --print --worktree "$WORKTREE_NAME" $DANGEROUS_FLAGS -p "\$PROMPT" 2>&1 | DUP=1 "$REPO_DIR/ci3/cache_log" "claudebox-$SCRIPT_NAME" "$LOG_ID"
CLAUDE_EXIT=\${PIPESTATUS[0]}
echo "\$CLAUDE_EXIT" > "$EXIT_FILE"
exit \$CLAUDE_EXIT
RUNEOF
chmod +x "$RUNNER_SCRIPT" "$RUNNER_SCRIPT_CACHELOG"

# Don't error on bad exit code
set +e
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    # GHA: run directly (no tmux, logs go to Actions UI)
    claude \
        --print \
        --worktree "$WORKTREE_NAME" \
        $DANGEROUS_FLAGS \
        -p "$PROMPT"
    CLAUDE_EXIT=$?
else
    # Slack/local: run in tmux so sessions are attachable
    echo "Starting tmux session: $TMUX_SESSION"

    # Write session metadata for the console
    SESSIONS_DIR="$REPO_DIR/.claude/claudebox/sessions"
    mkdir -p "$SESSIONS_DIR"
    SESSION_FILE="$SESSIONS_DIR/$TMUX_SESSION.json"
    cat > "$SESSION_FILE" <<METAEOF
{
  "tmux": "$TMUX_SESSION",
  "script": "$SCRIPT_NAME",
  "prompt": $(printf '%s' "$USER_PROMPT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),
  "user": "${USER_NAME:-unknown}",
  "worktree": "$WORKTREE_NAME",
  "log_url": "${LOG_URL:-}",
  "slack_channel": "${SLACK_CHANNEL:-}",
  "github_comment": "${COMMENT_ID:-}",
  "started": "$(date -Iseconds)",
  "status": "running"
}
METAEOF

    if [ "$USE_CACHE_LOG" -eq 1 ]; then
        tmux new-session -d -s "$TMUX_SESSION" "bash $RUNNER_SCRIPT_CACHELOG"
    else
        tmux new-session -d -s "$TMUX_SESSION" "bash $RUNNER_SCRIPT"
    fi

    # Wait for tmux session to finish
    while tmux has-session -t "$TMUX_SESSION" 2>/dev/null; do
        sleep 2
    done
    CLAUDE_EXIT=$(cat "$EXIT_FILE" 2>/dev/null || echo 1)
    # Handle empty exit file
    [ -z "$CLAUDE_EXIT" ] && CLAUDE_EXIT=1

    # Update session metadata with completion
    python3 -c "
import json
with open('$SESSION_FILE') as f:
    d = json.load(f)
d['status'] = 'completed'
d['finished'] = '$(date -Iseconds)'
d['exit_code'] = int('${CLAUDE_EXIT}')
with open('$SESSION_FILE', 'w') as f:
    json.dump(d, f, indent=2)
" 2>/dev/null || true

    rm -f "$PROMPT_FILE" "$EXIT_FILE" "$RUNNER_SCRIPT" "$RUNNER_SCRIPT_CACHELOG"
fi
set -e

# Give streamer a moment to catch final output
sleep 2

echo ""
echo "━━━ Claude exited with code: $CLAUDE_EXIT ━━━"
exit "$CLAUDE_EXIT"
