#!/usr/bin/env bash
# test-e2e.sh — Minimal e2e test of the two-container Docker architecture.
# Exercises: network creation, sidecar startup, MCP health, Claude container, cleanup.
#
# Usage: bash test-e2e.sh
#
# Requires: docker, node 22+, claude binary, ~/.claude/.credentials.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="${CLAUDE_REPO_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
IMAGE="${CLAUDEBOX_DOCKER_IMAGE:-aztecprotocol/devbox:3.0}"

echo "━━━ ClaudeBox E2E Test ━━━"
echo "Script dir: $SCRIPT_DIR"
echo "Repo dir:   $REPO_DIR"
echo "Image:      $IMAGE"
echo ""

# Generate unique IDs
LOG_ID=$(head -c 16 /dev/urandom | xxd -p)
AUTH_TOKEN=$(python3 -c "import uuid; print(uuid.uuid4())")
SESSION_UUID=$(python3 -c "import uuid; print(uuid.uuid4())")
NETWORK="claudebox-net-$LOG_ID"
SIDECAR="claudebox-sidecar-$LOG_ID"
CLAUDE_CTR="claudebox-$LOG_ID"

# Workspace
WORKSPACE_DIR="/tmp/claudebox-test-$LOG_ID/workspace"
PROJECTS_DIR="/tmp/claudebox-test-$LOG_ID/claude-projects"
mkdir -p "$WORKSPACE_DIR" "$PROJECTS_DIR"

# Claude binary
CLAUDE_BIN=$(readlink -f "$(which claude)")

# Prompt
cat > "$WORKSPACE_DIR/prompt.txt" <<'PROMPT'
This is an e2e test. Do the following:
1. Call get_context to verify MCP tools work
2. Run: echo "hello from claudebox"
3. Run: git sparse-checkout list
4. Say "E2E TEST PASSED" and exit
PROMPT

cleanup() {
    echo ""
    echo "━━━ Cleanup ━━━"
    docker stop -t 2 "$SIDECAR" 2>/dev/null || true
    docker rm -f "$SIDECAR" 2>/dev/null || true
    docker rm -f "$CLAUDE_CTR" 2>/dev/null || true
    docker network rm "$NETWORK" 2>/dev/null || true
    rm -rf "/tmp/claudebox-test-$LOG_ID"
    echo "Done."
}
trap cleanup EXIT

# ── 1. Create network ────────────────────────────────────────────
echo "1. Creating Docker network: $NETWORK"
docker network create "$NETWORK"

# ── 2. Start sidecar ─────────────────────────────────────────────
echo "2. Starting sidecar: $SIDECAR"
docker run -d \
    --name "$SIDECAR" \
    --network "$NETWORK" \
    -v "$REPO_DIR/.git:/reference-repo/.git:ro" \
    -v "$WORKSPACE_DIR:/workspace:rw" \
    -v "$SCRIPT_DIR:/opt/claudebox:ro" \
    -e "MCP_PORT=9801" \
    -e "MCP_AUTH_TOKEN=$AUTH_TOKEN" \
    -e "CLAUDEBOX_LOG_ID=$LOG_ID" \
    -e "CLAUDEBOX_LOG_URL=http://ci.aztec-labs.com/$LOG_ID" \
    -e "CLAUDEBOX_USER=e2e-test" \
    "$IMAGE" \
    node --experimental-strip-types --no-warnings /opt/claudebox/mcp-sidecar.ts

# ── 3. Health check ──────────────────────────────────────────────
echo "3. Waiting for sidecar health..."
for i in $(seq 1 30); do
    if docker exec "$SIDECAR" curl -sf http://127.0.0.1:9801/health 2>/dev/null | grep -q ok; then
        echo "   Sidecar healthy after ${i}x500ms"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "   FAILED: sidecar health check timed out"
        docker logs "$SIDECAR"
        exit 1
    fi
    sleep 0.5
done

# ── 4. Start Claude container ────────────────────────────────────
echo "4. Starting Claude container: $CLAUDE_CTR"
echo "   MCP URL: http://$SIDECAR:9801/mcp/<token>"

docker run \
    --name "$CLAUDE_CTR" \
    --network "$NETWORK" \
    -v "$REPO_DIR/.git:/reference-repo/.git:ro" \
    -v "$WORKSPACE_DIR:/workspace:rw" \
    -v "$SCRIPT_DIR/container-entrypoint.sh:/entrypoint.sh:ro" \
    -v "$SCRIPT_DIR/container-claude.md:/entrypoint-assets/container-claude.md:ro" \
    -v "$PROJECTS_DIR:/root/.claude/projects:rw" \
    -v "$CLAUDE_BIN:/usr/local/bin/claude:ro" \
    -v "$HOME/.claude/.credentials.json:/root/.claude/.credentials.json:ro" \
    -v "$HOME/.claude/settings.json:/root/.claude/settings.json:ro" \
    -e "CLAUDEBOX_MCP_URL=http://$SIDECAR:9801/mcp/$AUTH_TOKEN" \
    -e "CLAUDEBOX_TARGET_REF=origin/next" \
    -e "SESSION_UUID=$SESSION_UUID" \
    "$IMAGE" \
    bash /entrypoint.sh

EXIT_CODE=$?
echo ""
echo "━━━ Claude exited: $EXIT_CODE ━━━"
