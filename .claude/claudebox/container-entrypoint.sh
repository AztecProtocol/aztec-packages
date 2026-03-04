#!/usr/bin/env bash
# container-entrypoint.sh — Runs INSIDE the Claude container.
# Writes MCP config, installs CLAUDE.md, launches Claude.
# Repo clone is lazy — Claude calls the clone_repo MCP tool when needed.
#
# Required env:  CLAUDEBOX_MCP_URL, SESSION_UUID
# Prompt:        /workspace/prompt.txt (mounted by host)
# Optional env:  CLAUDEBOX_RESUME_ID

set -euxo pipefail
trap 'echo ""; echo "━━━ Process exited ━━━"' EXIT

# Ensure cargo/rust tools are on PATH
export PATH="$HOME/.cargo/bin:$PATH"

MCP_URL="${CLAUDEBOX_MCP_URL:?required}"
SESSION_UUID="${SESSION_UUID:?required}"
RESUME_ID="${CLAUDEBOX_RESUME_ID:-}"
PROMPT_FILE="/workspace/prompt.txt"
CLAUDE_MD_TEMPLATE="${CLAUDEBOX_CONTAINER_CLAUDE_MD:-/opt/claudebox/container-claude.md}"

echo "━━━ Container Bootstrap ━━━"
echo "MCP:     $MCP_URL"
echo "Session: $SESSION_UUID"
[ -n "$RESUME_ID" ] && echo "Resume:  $RESUME_ID"

# ── Step 1: MCP config ──────────────────────────────────────────
cat > /tmp/mcp.json <<EOF
{
  "mcpServers": {
    "claudebox": {
      "type": "http",
      "url": "$MCP_URL"
    }
  }
}
EOF

# ── Step 2: Install CLAUDE.md ────────────────────────────────────
# Placed at /workspace/.claude/CLAUDE.md — Claude will start in /workspace
# and the repo (once cloned) lives at /workspace/aztec-packages
if [ -f "$CLAUDE_MD_TEMPLATE" ]; then
    mkdir -p /workspace/.claude
    cp "$CLAUDE_MD_TEMPLATE" /workspace/.claude/CLAUDE.md
fi

# ── Step 3: Read prompt ──────────────────────────────────────────
if [ ! -f "$PROMPT_FILE" ]; then
    echo "ERROR: $PROMPT_FILE not found" >&2
    exit 1
fi
PROMPT=$(cat "$PROMPT_FILE")

echo ""
echo "━━━ Launching Claude ━━━"
echo ""

cd /workspace

# ── Step 4: Run Claude ───────────────────────────────────────────
COMMON_ARGS=(--print --dangerously-skip-permissions --mcp-config /tmp/mcp.json -p "$PROMPT")

set +e
if [ -n "$RESUME_ID" ]; then
    claude "${COMMON_ARGS[@]}" --resume "$RESUME_ID" --fork-session
    exit_code=$?
    # Fall back to fresh session if resume fails (e.g. JSONL from old mount path)
    if [ "$exit_code" -ne 0 ]; then
        echo ""
        echo "━━━ Resume failed (exit $exit_code), starting fresh session ━━━"
        echo ""
        RESUME_ID=""
    fi
fi
if [ -z "$RESUME_ID" ]; then
    claude "${COMMON_ARGS[@]}" --session-id "$SESSION_UUID"
    exit_code=$?
fi
set -e

echo ""
echo "━━━ Exit: $exit_code ━━━"
exit "$exit_code"
