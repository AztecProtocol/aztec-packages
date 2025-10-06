#!/usr/bin/env bash
set -euo pipefail

BB_ROOT=$(git rev-parse --show-toplevel)/barretenberg/cpp
rm -rf build

for variant in amd64-linux arm64-linux amd64-macos arm64-macos; do
  mkdir -p "build/$variant"
  cp -v "$BB_ROOT/build-zig-node-$variant/lib/nodejs_module.node" "build/$variant/" 2>/dev/null || echo "Warning: $variant not found"
done
