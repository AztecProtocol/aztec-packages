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
  echo "━━━ ClaudeBox Tests ━━━"
  node --experimental-strip-types --no-warnings test-docker-proxy.ts
}

case "${1:-}" in
  test) test_cmd ;;
  *)    build ;;
esac
