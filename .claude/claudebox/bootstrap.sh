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

case "${1:-}" in
  *)  build ;;
esac
