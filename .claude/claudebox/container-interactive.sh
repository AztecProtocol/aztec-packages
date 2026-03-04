#!/usr/bin/env bash
# container-interactive.sh — Interactive session inside ClaudeBox container.
# Reuses existing workspace, provides claude + MCP shell wrappers + keepalive.
#
# Required env: CLAUDEBOX_MCP_URL, CLAUDEBOX_SESSION_HASH
# Optional env: CLAUDEBOX_RESUME_ID, CLAUDEBOX_LOG_URL

set -euo pipefail

MCP_URL="${CLAUDEBOX_MCP_URL:?required}"
SESSION_HASH="${CLAUDEBOX_SESSION_HASH:?required}"
RESUME_ID="${CLAUDEBOX_RESUME_ID:-}"
LOG_URL="${CLAUDEBOX_LOG_URL:-}"
KEEPALIVE_URL="${CLAUDEBOX_KEEPALIVE_URL:-}"

# ── Ensure writable bin dir + cargo on PATH ──────────────────────
mkdir -p /home/aztec-dev/bin
export PATH="/home/aztec-dev/bin:$HOME/.cargo/bin:$PATH"

cd /workspace

# ── MCP config ────────────────────────────────────────────────────
cat > /tmp/mcp.json <<EOF
{"mcpServers":{"claudebox":{"type":"http","url":"$MCP_URL"}}}
EOF

# ── MCP helper: call a tool via JSON-RPC ──────────────────────────
cat > /home/aztec-dev/bin/_cb-call << 'SCRIPT'
#!/bin/bash
# Usage: _cb-call <tool_name> <json_arguments>
TOOL="$1"; shift
ARGS="$1"
PAYLOAD=$(jq -n --arg tool "$TOOL" --argjson args "$ARGS" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":$tool,"arguments":$args},"id":1}')
RESULT=$(curl -sf -X POST "$CLAUDEBOX_MCP_URL" -H "Content-Type: application/json" -d "$PAYLOAD" 2>/dev/null)
echo "$RESULT" | jq -r '.result.content[]?.text // .error.message // "No response"' 2>/dev/null || echo "$RESULT"
SCRIPT
chmod +x /home/aztec-dev/bin/_cb-call

# ── Shell wrappers ────────────────────────────────────────────────
cat > /home/aztec-dev/bin/cb-github << 'SCRIPT'
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
chmod +x /home/aztec-dev/bin/cb-github

cat > /home/aztec-dev/bin/cb-slack << 'SCRIPT'
#!/bin/bash
# Usage: cb-slack chat.postMessage '{"text":"hello"}'
METHOD="${1:?usage: cb-slack method args_json}"
ARGS="${2:-{}}"
_cb-call slack_api "{\"method\":\"$METHOD\",\"args\":$ARGS}"
SCRIPT
chmod +x /home/aztec-dev/bin/cb-slack

cat > /home/aztec-dev/bin/cb-status << 'SCRIPT'
#!/bin/bash
# Usage: cb-status "Working on it..."
_cb-call session_status "{\"status\":\"$*\"}"
SCRIPT
chmod +x /home/aztec-dev/bin/cb-status

cat > /home/aztec-dev/bin/cb-context << 'SCRIPT'
#!/bin/bash
_cb-call get_context "{}"
SCRIPT
chmod +x /home/aztec-dev/bin/cb-context

cat > /home/aztec-dev/bin/cb-respond << 'SCRIPT'
#!/bin/bash
# Usage: cb-respond "Here's what I found..."
_cb-call respond_to_user "{\"message\":\"$*\"}"
SCRIPT
chmod +x /home/aztec-dev/bin/cb-respond

# ── Keepalive command ─────────────────────────────────────────────
cat > /home/aztec-dev/bin/keepalive << SCRIPT
#!/bin/bash
MINS="\${1:-5}"
if [ -n "$KEEPALIVE_URL" ]; then
  curl -sf -X POST "$KEEPALIVE_URL" -H "Content-Type: application/json" -d "{\"minutes\":\$MINS}" > /dev/null && \
    echo "Keepalive extended to \$MINS minutes" || echo "Failed to extend keepalive"
else
  echo "Keepalive not available (no URL configured)"
fi
SCRIPT
chmod +x /home/aztec-dev/bin/keepalive

# ── Banner ────────────────────────────────────────────────────────
echo ""
echo "━━━ ClaudeBox Interactive Session ━━━"
echo "Session: $SESSION_HASH"
[ -n "$LOG_URL" ] && echo "Log:     $LOG_URL"
if [ -n "$RESUME_ID" ]; then
  echo "Resume:  claude --resume $RESUME_ID --mcp-config /tmp/mcp.json"
fi
echo ""
echo "Repo:    Use clone_repo MCP tool or: git clone --shared /reference-repo/.git /workspace/aztec-packages"
echo "Tools:   cb-github, cb-slack, cb-status, cb-context, cb-respond"
echo "Timer:   keepalive <minutes>  (default: 5 min)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Keep container alive — actual shell sessions attach via `docker exec`
exec sleep infinity
