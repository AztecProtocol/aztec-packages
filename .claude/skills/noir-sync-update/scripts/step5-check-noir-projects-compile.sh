#!/bin/bash
set -euo pipefail

# Step 5: Check noir-projects still compiles

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

echo "=== Step 5: Check noir-projects compilation ==="

cd "$REPO_ROOT/noir-projects"
echo "Running ./bootstrap.sh..."
./bootstrap.sh

echo ""
echo "✓ Step 5 complete. noir-projects compiles successfully."
