#!/usr/bin/env bash
# bootstrap.sh — Build claudebox image and install dependencies.
set -euo pipefail
cd "$(dirname "$0")"

function build {
  echo "━━━ ClaudeBox Bootstrap ━━━"

  # 1. Install node dependencies
  echo "Installing npm dependencies..."
  npm install --silent

  # 2. Build Docker image
  echo "Building claudebox Docker image..."
  docker build -t claudebox:latest .

  echo ""
  echo "Done. Image: claudebox:latest"
  echo "Start server: systemctl --user restart claudebox-slack.service"
}

function test_cmd {
  echo "━━━ ClaudeBox Unit Tests ━━━"
  node --experimental-strip-types --no-warnings test-docker-proxy.ts
}

function test_e2e {
  echo "━━━ ClaudeBox E2E Tests ━━━"
  bash test-e2e-proxy.sh
}

function kill_stale_proxies {
  # Kill any orphaned docker-proxy node processes from prior test runs.
  # Use pgrep+kill (not pkill -f) to avoid killing the calling shell.
  for pid in $(pgrep -f "node.*docker-proxy" 2>/dev/null || true); do
    kill "$pid" 2>/dev/null || true
  done
  sleep 0.5
}

case "${1:-}" in
  test)     test_cmd ;;
  test-e2e) kill_stale_proxies; test_e2e ;;
  test-all) test_cmd; kill_stale_proxies; test_e2e ;;
  *)        build ;;
esac
