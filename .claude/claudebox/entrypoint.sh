#!/usr/bin/env bash
# entrypoint.sh - Entry point for ClaudeBox sessions
#
# Usage: entrypoint.sh <script-name> [args...] [--comment-id=<id>] [--repo=<owner/repo>]
#
# Starts Claude in an isolated worktree, streams session output,
# and cleans up on exit. Prompt is read from stdin.

set -euo pipefail

repo_dir="${CLAUDE_REPO_DIR:-$HOME/aztec-packages}"

# ── Parse arguments ──────────────────────────────────────────────
script_name=""
comment_id=""
run_comment_id=""
repo=""
slack_channel=""
slack_thread_ts=""
slack_message_ts=""
user_name=""

for arg in "$@"; do
    case "$arg" in
        --comment-id=*)      comment_id="${arg#--comment-id=}" ;;
        --run-comment-id=*)  run_comment_id="${arg#--run-comment-id=}" ;;
        --repo=*)            repo="${arg#--repo=}" ;;
        --slack-channel=*)   slack_channel="${arg#--slack-channel=}" ;;
        --slack-thread-ts=*) slack_thread_ts="${arg#--slack-thread-ts=}" ;;
        --slack-message-ts=*)slack_message_ts="${arg#--slack-message-ts=}" ;;
        --user=*)            user_name="${arg#--user=}" ;;
        *)                   [ -z "$script_name" ] && script_name="$arg" ;;
    esac
done

if [ -z "$script_name" ]; then
    echo "ERROR: No script name provided" >&2
    echo "Usage: entrypoint.sh <script-name> [--comment-id=<id>] [--repo=<owner/repo>]" >&2
    exit 1
fi

# Read prompt from stdin
user_prompt=""
if [ ! -t 0 ]; then
    user_prompt=$(cat)
fi

# ── Update repo ──────────────────────────────────────────────────
cd "$repo_dir"
git fetch origin --quiet 2>/dev/null || true

# ── Validate script exists ───────────────────────────────────────
script_file="$repo_dir/.claude/scripts/$script_name"
if [ ! -f "$script_file" ]; then
    echo "ERROR: Script not found: .claude/scripts/$script_name" >&2
    echo "Available scripts:" >&2
    ls "$repo_dir/.claude/scripts/" 2>/dev/null | grep -v '\.py$' >&2 || echo "  (none)" >&2
    exit 1
fi

# ── Build prompt ─────────────────────────────────────────────────
common_file="$repo_dir/.claude/scripts/common.md"
prompt=""
if [ -f "$common_file" ]; then
    prompt="$(cat "$common_file")

---

"
fi
prompt="$prompt$(cat "$script_file")"

if [ -n "$user_prompt" ]; then
    prompt="$prompt

User request: $user_prompt"
fi

prompt="$prompt

---
Metadata (GitHub):
- Comment ID: ${comment_id:-none}
- Run Comment ID: ${run_comment_id:-none}
- Repository: ${repo:-none}

Metadata (Slack):
- Channel: ${slack_channel:-none}
- Thread TS: ${slack_thread_ts:-none}
- Message TS: ${slack_message_ts:-none}

Script: $script_name"

# ── Generate worktree name ───────────────────────────────────────
ts=$(date +%s)
if [ -n "$comment_id" ]; then
    worktree_name="bot-gh-${comment_id}-${ts}"
elif [ -n "$slack_channel" ]; then
    worktree_name="bot-slack-${ts}"
else
    worktree_name="bot-local-${ts}"
fi

# ── Set up environment ────────────────────────────────────────────
worktree_path="$repo_dir/.claude/worktrees/$worktree_name"
export CLAUDE_WORKTREE_PATH="$worktree_path"
export CLAUDE_REPO_DIR="$repo_dir"
export GITHUB_TOKEN="${GH_TOKEN:-}"
export SLACK_BOT_TOKEN="${SLACK_BOT_TOKEN:-}"

# ── Cleanup on exit ──────────────────────────────────────────────
stream_pid=""
cleanup() {
    local exit_code=$?
    echo ""
    echo "━━━ Cleanup ━━━"

    if [ -n "$stream_pid" ] && kill -0 "$stream_pid" 2>/dev/null; then
        kill "$stream_pid" 2>/dev/null || true
        wait "$stream_pid" 2>/dev/null || true
    fi

    if [ -d "$worktree_path" ]; then
        echo "Removing worktree: $worktree_name"
        cd "$repo_dir"
        git worktree remove "$worktree_path" --force 2>/dev/null || true
        git branch -D "worktree-$worktree_name" 2>/dev/null || true
    fi

    echo "Exit code: $exit_code"
    exit "$exit_code"
}
trap cleanup EXIT

# ── Set up cache_log for non-GHA runs ────────────────────────────
# Pipe output through ci3/cache_log for a live log URL.
log_id=""
use_cache_log=0
if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
    NO_CD=1 source "$repo_dir/ci3/source" || true
    source "$repo_dir/ci3/source_redis" || true
    log_id=$(head -c 16 /dev/urandom | xxd -p)
    use_cache_log=1
    export LOG_URL="http://ci.aztec-labs.com/$log_id"
    echo "Log URL: $LOG_URL" >&2

    if [ -n "$slack_channel" ] && [ -n "$slack_message_ts" ] && [ -n "${SLACK_BOT_TOKEN:-}" ]; then
        curl -s -X POST -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
            -H "Content-type: application/json" \
            "https://slack.com/api/chat.update" \
            -d "{\"channel\":\"$slack_channel\",\"ts\":\"$slack_message_ts\",\"text\":\"ClaudeBox is running \`$script_name\`... <$LOG_URL|Claude session log>\"}" \
            >/dev/null 2>&1 || true
    fi
else
    export LOG_URL=""
fi

if [ -n "$LOG_URL" ]; then
    prompt="$prompt

Log URL: $LOG_URL"
fi

# ── Print header ─────────────────────────────────────────────────
echo "━━━ ClaudeBox Starting ━━━"
echo "Script:    $script_name"
echo "Prompt:    ${user_prompt:-<none>}"
echo "Worktree:  $worktree_name"
echo "Comment:   ${comment_id:-<local>}"
echo "Repo:      ${repo:-<local>}"
[ -n "$LOG_URL" ] && echo "Log:       $LOG_URL"
echo ""

# ── Start session streamer in background ─────────────────────────
"$repo_dir/.claude/claudebox/stream-session.ts" "$worktree_name" &
stream_pid=$!

# ── Start Claude ─────────────────────────────────────────────────
unset CLAUDECODE 2>/dev/null || true

# NOTE: We run this in a sandboxed environment with appropriately-scoped permissions.
dangerous_flags=--dangerously-skip-permissions
tmux_session="${log_id:-$worktree_name}"

prompt_file="/tmp/claudebox-prompt-$$"
exit_file="/tmp/claudebox-exit-$$"
printf '%s' "$prompt" > "$prompt_file"

# Build wrapper script for tmux (avoids nested quoting)
runner_script="/tmp/claudebox-run-$$.sh"
cat > "$runner_script" <<RUNEOF
#!/usr/bin/env bash
export PATH="$PATH"
set -uo pipefail
prompt=\$(cat "$prompt_file")
if [ "$use_cache_log" -eq 1 ]; then
    claude --print --worktree "$worktree_name" $dangerous_flags -p "\$prompt" 2>&1 | DUP=1 "$repo_dir/ci3/cache_log" "claudebox-$script_name" "$log_id"
    claude_exit=\${PIPESTATUS[0]}
else
    claude --print --worktree "$worktree_name" $dangerous_flags -p "\$prompt"
    claude_exit=\$?
fi
echo "\$claude_exit" > "$exit_file"
exit \$claude_exit
RUNEOF
chmod +x "$runner_script"

set +e
if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
    # Slack/local: write session metadata, run in tmux
    echo "Starting tmux session: $tmux_session"

    sessions_dir="$repo_dir/.claude/claudebox/sessions"
    mkdir -p "$sessions_dir"
    session_file="$sessions_dir/$tmux_session.json"
    cat > "$session_file" <<METAEOF
{
  "tmux": "$tmux_session",
  "script": "$script_name",
  "prompt": $(printf '%s' "$user_prompt" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),
  "user": "${user_name:-unknown}",
  "worktree": "$worktree_name",
  "log_url": "${LOG_URL:-}",
  "slack_channel": "${slack_channel:-}",
  "github_comment": "${comment_id:-}",
  "started": "$(date -Iseconds)",
  "status": "running"
}
METAEOF

    tmux new-session -d -s "$tmux_session" "bash $runner_script"

    while tmux has-session -t "$tmux_session" 2>/dev/null; do
        sleep 2
    done
    claude_exit=$(cat "$exit_file" 2>/dev/null || echo 1)
    [ -z "$claude_exit" ] && claude_exit=1

    python3 -c "
import json
with open('$session_file') as f:
    d = json.load(f)
d['status'] = 'completed'
d['finished'] = '$(date -Iseconds)'
d['exit_code'] = int('${claude_exit}')
with open('$session_file', 'w') as f:
    json.dump(d, f, indent=2)
" 2>/dev/null || true

    rm -f "$prompt_file" "$exit_file" "$runner_script"
else
    # GHA: run directly (logs go to Actions UI)
    bash "$runner_script"
    claude_exit=$(cat "$exit_file" 2>/dev/null || echo 1)
    [ -z "$claude_exit" ] && claude_exit=1
    rm -f "$prompt_file" "$exit_file" "$runner_script"
fi
set -e

sleep 2

echo ""
echo "━━━ Claude exited with code: $claude_exit ━━━"
exit "$claude_exit"
