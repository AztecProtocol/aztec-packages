#!/usr/bin/env bash
# container-entrypoint.sh — Runs INSIDE the Claude container.
# Sets up full checkout via git alternates, writes MCP config, launches Claude.
#
# Required env:  CLAUDEBOX_MCP_URL, SESSION_UUID
# Prompt:        /workspace/prompt.txt (mounted by host)
# Optional env:  CLAUDEBOX_TARGET_REF, CLAUDEBOX_RESUME_ID

set -euxo pipefail
trap 'echo ""; echo "━━━ Process exited ━━━"' EXIT

WORKSPACE="/workspace/aztec-packages"
REFERENCE_GIT="/reference-repo/.git"
MCP_URL="${CLAUDEBOX_MCP_URL:?required}"
SESSION_UUID="${SESSION_UUID:?required}"
TARGET_REF="${CLAUDEBOX_TARGET_REF:-origin/next}"
RESUME_ID="${CLAUDEBOX_RESUME_ID:-}"
PROMPT_FILE="/workspace/prompt.txt"
CLAUDE_MD_TEMPLATE="${CLAUDEBOX_CONTAINER_CLAUDE_MD:-/opt/claudebox/container-claude.md}"

echo "━━━ Container Bootstrap ━━━"
echo "MCP:     $MCP_URL"
echo "Ref:     $TARGET_REF"
echo "Session: $SESSION_UUID"
[ -n "$RESUME_ID" ] && echo "Resume:  $RESUME_ID"

# ── Step 1: Full checkout via git clone --shared (zero-copy objects) ──
if [ ! -d "$WORKSPACE/.git" ]; then
    git config --global --add safe.directory "$REFERENCE_GIT"
    git config --global --add safe.directory "$WORKSPACE"
    git clone --shared "$REFERENCE_GIT" "$WORKSPACE"
    cd "$WORKSPACE"
    git remote set-url origin https://github.com/AztecProtocol/aztec-packages.git
    git checkout --detach "$TARGET_REF" 2>/dev/null || git checkout --detach origin/next
else
    cd "$WORKSPACE"
    echo "Workspace exists, reusing."
fi

# ── Step 2: MCP config ──────────────────────────────────────────
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

# ── Step 3: Install CLAUDE.md ────────────────────────────────────
if [ -f "$CLAUDE_MD_TEMPLATE" ]; then
    mkdir -p "$WORKSPACE/.claude"
    cp "$CLAUDE_MD_TEMPLATE" "$WORKSPACE/.claude/CLAUDE.md"
    # Exclude from git so create_pr's `git add -A` doesn't commit it
    echo ".claude/CLAUDE.md" >> "$WORKSPACE/.git/info/exclude"
fi

# ── Step 4: Read prompt ──────────────────────────────────────────
if [ ! -f "$PROMPT_FILE" ]; then
    echo "ERROR: $PROMPT_FILE not found" >&2
    exit 1
fi
PROMPT=$(cat "$PROMPT_FILE")

echo ""
echo "━━━ Launching Claude ━━━"
echo ""

# ── Step 5: Run Claude ───────────────────────────────────────────
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
