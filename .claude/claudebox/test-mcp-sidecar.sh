#!/usr/bin/env bash
# test-mcp-sidecar.sh — Test the MCP sidecar in production-like Docker setup.
#
# Spins up a private Docker network + sidecar container, then runs the MCP
# test client inside another container on the same network. No exposed ports.
#
# Usage:  bash test-mcp-sidecar.sh
# Env:    GH_TOKEN (optional — enables create_pr + github_api GET tests)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"
trap test_cleanup EXIT

echo "━━━ MCP Sidecar Test ━━━"
echo "Repo:  $REPO_DIR"
echo "Image: $DOCKER_IMAGE"
echo "GH:    ${GH_TOKEN:+yes}${GH_TOKEN:-no}"
echo ""

# ── 1. Create workspace ──────────────────────────────────────────
echo "1. Creating test workspace..."
WORKSPACE=$(create_test_workspace)
echo "   $WORKSPACE"

# ── 2. Create private network ────────────────────────────────────
echo "2. Creating private Docker network..."
NETWORK=$(create_test_network)
echo "   $NETWORK"

# ── 3. Start sidecar (no exposed ports) ──────────────────────────
echo "3. Starting sidecar..."
GH_ARGS=()
[ -n "${GH_TOKEN:-}" ] && GH_ARGS+=("GH_TOKEN=$GH_TOKEN")
start_test_sidecar "$NETWORK" "$WORKSPACE" "${GH_ARGS[@]}"
echo "   $SIDECAR_NAME"

# ── 4. Wait for health ───────────────────────────────────────────
echo "4. Waiting for sidecar health..."
wait_for_health
echo "   Healthy."

# ── 5. Run test client on the same network ────────────────────────
echo "5. Running MCP test client..."
echo ""

TEST_ARGS=()
[ -n "${GH_TOKEN:-}" ] && TEST_ARGS+=("GH_TOKEN=$GH_TOKEN")

set +e
run_test_container "$NETWORK" "$WORKSPACE" "test-mcp-client.ts" "${TEST_ARGS[@]}"
EXIT_CODE=$?
set -e

echo ""
if [ "$EXIT_CODE" -eq 0 ]; then
    echo "━━━ PASS ━━━"
else
    echo "━━━ FAIL (exit $EXIT_CODE) ━━━"
    echo ""
    echo "Sidecar logs:"
    docker logs "$SIDECAR_NAME" 2>&1 | tail -30
fi

exit "$EXIT_CODE"
