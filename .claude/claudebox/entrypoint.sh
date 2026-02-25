#!/usr/bin/env bash
# entrypoint.sh - CI runner for ClaudeBox sessions
#
# Usage: <script> "prompt" [--flags...]   (script calls entrypoint via run.sh)
#        entrypoint.sh <name> [--flags...] <<< "prompt"  (direct, for resume)
#
# Reads prompt from stdin. Sets up worktree, cache_log, session metadata,
# and runs Claude. For local use (no CI flags), passes through to claude directly.

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
run_url=""
resume_session_id=""
prev_log_url=""
prev_worktree=""
link=""

for arg in "$@"; do
    case "$arg" in
        --comment-id=*)         comment_id="${arg#--comment-id=}" ;;
        --run-comment-id=*)     run_comment_id="${arg#--run-comment-id=}" ;;
        --repo=*)               repo="${arg#--repo=}" ;;
        --slack-channel=*)      slack_channel="${arg#--slack-channel=}" ;;
        --slack-thread-ts=*)    slack_thread_ts="${arg#--slack-thread-ts=}" ;;
        --slack-message-ts=*)   slack_message_ts="${arg#--slack-message-ts=}" ;;
        --user=*)               user_name="${arg#--user=}" ;;
        --run-url=*)            run_url="${arg#--run-url=}" ;;
        --link=*)               link="${arg#--link=}" ;;
        --resume-session-id=*)  resume_session_id="${arg#--resume-session-id=}" ;;
        --prev-log-url=*)       prev_log_url="${arg#--prev-log-url=}" ;;
        --prev-worktree=*)      prev_worktree="${arg#--prev-worktree=}" ;;
        *)                      [ -z "$script_name" ] && script_name="$arg" ;;
    esac
done

if [ -z "$script_name" ]; then
    echo "ERROR: No script name provided" >&2
    exit 1
fi

# ── Read prompt from stdin ───────────────────────────────────────
stdin_prompt=""
if [ ! -t 0 ]; then
    stdin_prompt=$(cat)
fi

# ── Update repo ──────────────────────────────────────────────────
cd "$repo_dir"
git fetch origin --quiet 2>/dev/null || true

# ── Build prompt ─────────────────────────────────────────────────
if [ -n "$resume_session_id" ]; then
    # Resume: user follow-up message with preamble
    prompt="The user is following up on a previous conversation. They expect a reply in the Slack thread or GitHub comment. Address their message directly.

Metadata (Slack):
- Channel: ${slack_channel:-none}
- Thread TS: ${slack_thread_ts:-none}
- Message TS: ${slack_message_ts:-none}

"
    [ -n "$prev_log_url" ] && prompt="${prompt}Previous session log: $prev_log_url
"
    prompt="${prompt}
User follow-up: $stdin_prompt"
else
    # New session: prompt from stdin (built by the calling script)
    prompt="$stdin_prompt"

    # Append metadata
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
fi

# ── Local passthrough (no CI infrastructure) ─────────────────────
if [ -z "$slack_channel" ] && [ -z "$comment_id" ] && [ -z "$run_url" ] && [ -z "$link" ]; then
    exec claude --print --dangerously-skip-permissions -p "$prompt"
fi

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
encoded_wt_path=$(echo "$worktree_path" | tr '/.' '--')
project_dir="$HOME/.claude/projects/$encoded_wt_path"
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

# ── Set up cache_log ──────────────────────────────────────────────
NO_CD=1 source "$repo_dir/ci3/source" || true
source "$repo_dir/ci3/source_redis" || true
log_id=$(head -c 16 /dev/urandom | xxd -p)
export LOG_URL="http://ci.aztec-labs.com/$log_id"
echo "Log URL: $LOG_URL" >&2

# Build Slack thread link
slack_link=""
if [ -n "$slack_channel" ] && [ -n "$slack_message_ts" ] && [ -n "$slack_thread_ts" ]; then
    slack_link="https://aztecprotocol.slack.com/archives/${slack_channel}/p${slack_message_ts//.}?thread_ts=${slack_thread_ts}&cid=${slack_channel}"
elif [ -n "$slack_channel" ] && [ -n "$slack_thread_ts" ]; then
    slack_link="https://aztecprotocol.slack.com/archives/${slack_channel}/p${slack_thread_ts//.}?thread_ts=${slack_thread_ts}&cid=${slack_channel}"
fi

# Build link for session metadata (explicit --link, or Slack, or GitHub)
if [ -z "$link" ]; then
    if [ -n "$run_url" ]; then
        link="$run_url"
    elif [ -n "$slack_link" ]; then
        link="$slack_link"
    fi
fi

if [ -n "$slack_channel" ] && [ -n "$slack_message_ts" ] && [ -n "${SLACK_BOT_TOKEN:-}" ]; then
    if [ -n "$resume_session_id" ]; then
        status_text="ClaudeBox running, treating your message as a reply... <$LOG_URL|log>"
        [ -n "$prev_log_url" ] && status_text="$status_text (previous: <$prev_log_url|log>)"
    else
        status_text="ClaudeBox is running \`$script_name\`... <$LOG_URL|Claude session log>"
    fi
    curl -s -X POST -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        -H "Content-type: application/json" \
        "https://slack.com/api/chat.update" \
        -d "{\"channel\":\"$slack_channel\",\"ts\":\"$slack_message_ts\",\"text\":\"$status_text\"}" \
        >/dev/null 2>&1 || true
fi

# Append log URL to prompt
prompt="$prompt

Log URL: $LOG_URL"
[ -n "$run_url" ] && prompt="$prompt
Run URL: $run_url"
[ -n "$link" ] && prompt="$prompt
Link: $link"

# ── Print header ─────────────────────────────────────────────────
echo "━━━ ClaudeBox Starting ━━━"
echo "Script:    $script_name"
echo "Worktree:  $worktree_name"
[ -n "$resume_session_id" ] && echo "Resume:    $resume_session_id"
[ -n "$prev_log_url" ] && echo "Prev log:  $prev_log_url"
[ -n "$link" ] && echo "Link:      $link"
echo "Log:       $LOG_URL"
echo ""

# ── Start session streamer in background ─────────────────────────
cache_log_name="claudebox-$script_name"
[ -n "$resume_session_id" ] && cache_log_name="claudebox-reply"

# Set PARENT_LOG_ID for chaining reply logs
export PARENT_LOG_ID="${prev_log_url##*/}"

# Inject source links into the cache_log stream header
{
    [ -n "$slack_link" ] && echo "Slack: $slack_link"
    [ -n "$run_url" ] && echo "GitHub: $run_url"
    [ -n "$link" ] && [ "$link" != "$run_url" ] && [ "$link" != "$slack_link" ] && echo "Link: $link"
    echo "User: ${user_name:-unknown}"
    echo ""
    "$repo_dir/.claude/claudebox/stream-session.ts" "$worktree_name" 2>&1
} | DUP=1 "$repo_dir/ci3/cache_log" "$cache_log_name" "$log_id" &
stream_pid=$!

# ── Write session metadata ────────────────────────────────────────
sessions_dir="$repo_dir/.claude/claudebox/sessions"
mkdir -p "$sessions_dir"
session_file="$sessions_dir/$log_id.json"

# Generate Claude session UUID for resume capability
claude_session_uuid=$(python3 -c "import uuid; print(uuid.uuid4())")

cat > "$session_file" <<METAEOF
{
  "script": "$script_name",
  "prompt": $(printf '%s' "$stdin_prompt" | head -c 500 | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),
  "user": "${user_name:-unknown}",
  "worktree": "$worktree_name",
  "log_url": "${LOG_URL:-}",
  "link": "$link",
  "slack_channel": "${slack_channel:-}",
  "slack_thread_ts": "${slack_thread_ts:-}",
  "claude_session_id": "$claude_session_uuid",
  "resume_of": "${resume_session_id:-}",
  "started": "$(date -Iseconds)",
  "status": "running"
}
METAEOF

# ── Copy session data for resume ─────────────────────────────────
if [ -n "$resume_session_id" ] && [ -n "$prev_worktree" ]; then
    old_wt_path="$repo_dir/.claude/worktrees/$prev_worktree"
    old_encoded=$(echo "$old_wt_path" | tr '/.' '--')
    old_project_dir="$HOME/.claude/projects/$old_encoded"

    if [ -d "$old_project_dir" ]; then
        echo "Copying session data from $prev_worktree"
        mkdir -p "$project_dir"
        cp "$old_project_dir"/*.jsonl "$project_dir/" 2>/dev/null || true
        # Also copy session subdirectories (session state)
        for d in "$old_project_dir"/*/; do
            [ -d "$d" ] && cp -r "$d" "$project_dir/" 2>/dev/null || true
        done
    else
        echo "WARN: Previous session project dir not found: $old_project_dir" >&2
    fi
fi

# ── Start Claude ─────────────────────────────────────────────────
unset CLAUDECODE 2>/dev/null || true

# NOTE: We run this in a sandboxed environment with appropriately-scoped permissions.
set +e
if [ -n "$resume_session_id" ]; then
    claude --print --resume "$resume_session_id" --fork-session \
        --worktree "$worktree_name" --dangerously-skip-permissions -p "$prompt"
else
    claude --print --worktree "$worktree_name" --dangerously-skip-permissions \
        --session-id "$claude_session_uuid" -p "$prompt"
fi
claude_exit=$?
set -e

# ── Update session metadata ──────────────────────────────────────
# Read the actual claude_session_id from the newest JSONL in the project dir.
# For --fork-session, Claude creates a new session ID we need to capture.
actual_session_id=$(ls -t "$project_dir"/*.jsonl 2>/dev/null \
    | head -1 \
    | xargs -I{} basename {} .jsonl 2>/dev/null || true)

python3 -c "
import json
with open('$session_file') as f:
    d = json.load(f)
d['status'] = 'completed'
d['finished'] = '$(date -Iseconds)'
d['exit_code'] = int('${claude_exit}')
sid = '${actual_session_id}'
if sid:
    d['claude_session_id'] = sid
with open('$session_file', 'w') as f:
    json.dump(d, f, indent=2)
" 2>/dev/null || true

# ── Update Slack status on completion ────────────────────────────
if [ -n "$slack_channel" ] && [ -n "$slack_message_ts" ] && [ -n "${SLACK_BOT_TOKEN:-}" ]; then
    if [ "$claude_exit" -eq 0 ]; then
        final_text="ClaudeBox completed <$LOG_URL|log>"
    else
        final_text="ClaudeBox exited with error (code $claude_exit) <$LOG_URL|log>"
    fi
    if [ -n "$prev_log_url" ]; then
        final_text="$final_text (previous: <$prev_log_url|log>)"
    fi
    curl -s -X POST -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        -H "Content-type: application/json" \
        "https://slack.com/api/chat.update" \
        -d "{\"channel\":\"$slack_channel\",\"ts\":\"$slack_message_ts\",\"text\":\"$final_text\"}" \
        >/dev/null 2>&1 || true
fi

sleep 2

echo ""
echo "━━━ Claude exited with code: $claude_exit ━━━"
exit "$claude_exit"
