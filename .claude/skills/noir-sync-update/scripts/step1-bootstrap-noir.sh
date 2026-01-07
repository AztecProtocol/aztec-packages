#!/bin/bash
set -euo pipefail

# Step 1: Ensure the noir submodule is bootstrapped
# This pulls the new submodule commit and builds noir

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

echo "=== Step 1: Bootstrap noir submodule ==="
cd "$REPO_ROOT/noir"

echo "Running ./bootstrap.sh in noir..."
./bootstrap.sh

echo ""
echo "=== Verification ==="
cd "$REPO_ROOT"
if git status noir/ --porcelain | grep -q .; then
    echo "WARNING: Unexpected changes in noir directory:"
    git status noir/ --short
    exit 1
else
    echo "✓ No unexpected changes in noir directory"
fi

echo ""
echo "Step 1 complete. No commit needed."
