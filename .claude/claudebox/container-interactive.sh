#!/usr/bin/env bash
# container-interactive.sh — Interactive session inside ClaudeBox container.
# Reuses existing workspace, provides claude + MCP shell wrappers + keepalive.
#
# Required env: CLAUDEBOX_MCP_URL, CLAUDEBOX_SESSION_HASH
# Optional env: CLAUDEBOX_RESUME_ID, CLAUDEBOX_LOG_URL, CLAUDEBOX_TARGET_REF

set -euo pipefail

WORKSPACE="/workspace/aztec-packages"
REFERENCE_GIT="/reference-repo/.git"
MCP_URL="${CLAUDEBOX_MCP_URL:?required}"
SESSION_HASH="${CLAUDEBOX_SESSION_HASH:?required}"
TARGET_REF="${CLAUDEBOX_TARGET_REF:-origin/next}"
RESUME_ID="${CLAUDEBOX_RESUME_ID:-}"
LOG_URL="${CLAUDEBOX_LOG_URL:-}"
KEEPALIVE_URL="${CLAUDEBOX_KEEPALIVE_URL:-}"

# ── Ensure writable bin dir on PATH ──────────────────────────────
mkdir -p /tmp/claudehome/bin
export PATH="/tmp/claudehome/bin:$PATH"

# ── Workspace setup (reuse if exists) ─────────────────────────────
if [ ! -d "$WORKSPACE/.git" ]; then
    git config --global --add safe.directory "$REFERENCE_GIT"
    git config --global --add safe.directory "$WORKSPACE"
    git clone --shared "$REFERENCE_GIT" "$WORKSPACE"
    cd "$WORKSPACE"
    git remote set-url origin https://github.com/AztecProtocol/aztec-packages.git
    git checkout --detach "$TARGET_REF" 2>/dev/null || git checkout --detach origin/next
else
    cd "$WORKSPACE"
fi

# ── MCP config ────────────────────────────────────────────────────
cat > /tmp/mcp.json <<EOF
{"mcpServers":{"claudebox":{"type":"http","url":"$MCP_URL"}}}
EOF

# ── MCP helper: call a tool via JSON-RPC ──────────────────────────
cat > /tmp/claudehome/bin/_cb-call << 'SCRIPT'
#!/bin/bash
# Usage: _cb-call <tool_name> <json_arguments>
TOOL="$1"; shift
ARGS="$1"
PAYLOAD=$(jq -n --arg tool "$TOOL" --argjson args "$ARGS" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":$tool,"arguments":$args},"id":1}')
RESULT=$(curl -sf -X POST "$CLAUDEBOX_MCP_URL" -H "Content-Type: application/json" -d "$PAYLOAD" 2>/dev/null)
echo "$RESULT" | jq -r '.result.content[]?.text // .error.message // "No response"' 2>/dev/null || echo "$RESULT"
SCRIPT
chmod +x /tmp/claudehome/bin/_cb-call

# ── Shell wrappers ────────────────────────────────────────────────
cat > /tmp/claudehome/bin/cb-github << 'SCRIPT'
#!/bin/bash
# Usage: cb-github GET repos/AztecProtocol/aztec-packages/pulls/123
#        cb-github POST repos/AztecProtocol/aztec-packages/issues/123/comments '{"body":"hello"}'
METHOD="${1:?usage: cb-github METHOD path [body_json]}"
PATH_ARG="${2:?usage: cb-github METHOD path [body_json]}"
BODY="${3:-null}"
if [ "$BODY" = "null" ]; then
  _cb-call github_api "{\"method\":\"$METHOD\",\"path\":\"$PATH_ARG\"}"
else
  _cb-call github_api "{\"method\":\"$METHOD\",\"path\":\"$PATH_ARG\",\"body\":$BODY}"
fi
SCRIPT
chmod +x /tmp/claudehome/bin/cb-github

cat > /tmp/claudehome/bin/cb-slack << 'SCRIPT'
#!/bin/bash
# Usage: cb-slack chat.postMessage '{"text":"hello"}'
METHOD="${1:?usage: cb-slack method args_json}"
ARGS="${2:-{}}"
_cb-call slack_api "{\"method\":\"$METHOD\",\"args\":$ARGS}"
SCRIPT
chmod +x /tmp/claudehome/bin/cb-slack

cat > /tmp/claudehome/bin/cb-status << 'SCRIPT'
#!/bin/bash
# Usage: cb-status "Working on it..."
_cb-call session_status "{\"status\":\"$*\"}"
SCRIPT
chmod +x /tmp/claudehome/bin/cb-status

cat > /tmp/claudehome/bin/cb-context << 'SCRIPT'
#!/bin/bash
_cb-call get_context "{}"
SCRIPT
chmod +x /tmp/claudehome/bin/cb-context

cat > /tmp/claudehome/bin/cb-respond << 'SCRIPT'
#!/bin/bash
# Usage: cb-respond "Here's what I found..."
_cb-call respond_to_user "{\"message\":\"$*\"}"
SCRIPT
chmod +x /tmp/claudehome/bin/cb-respond

# ── Keepalive command ─────────────────────────────────────────────
cat > /tmp/claudehome/bin/keepalive << SCRIPT
#!/bin/bash
MINS="\${1:-5}"
if [ -n "$KEEPALIVE_URL" ]; then
  curl -sf -X POST "$KEEPALIVE_URL" -H "Content-Type: application/json" -d "{\"minutes\":\$MINS}" > /dev/null && \
    echo "Keepalive extended to \$MINS minutes" || echo "Failed to extend keepalive"
else
  echo "Keepalive not available (no URL configured)"
fi
SCRIPT
chmod +x /tmp/claudehome/bin/keepalive

# ── Banner ────────────────────────────────────────────────────────
echo ""
echo "━━━ ClaudeBox Interactive Session ━━━"
echo "Session: $SESSION_HASH"
[ -n "$LOG_URL" ] && echo "Log:     $LOG_URL"
if [ -n "$RESUME_ID" ]; then
  echo "Resume:  claude --resume $RESUME_ID --mcp-config /tmp/mcp.json"
fi
echo ""
echo "Tools:   cb-github, cb-slack, cb-status, cb-context, cb-respond"
echo "Timer:   keepalive <minutes>  (default: 5 min)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Keep container alive — actual shell sessions attach via `docker exec`
exec sleep infinity
