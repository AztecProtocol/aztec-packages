#!/bin/bash
set -euo pipefail

# Step 3: Update yarn.lock in yarn-project

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

echo "=== Step 3: Update yarn-project yarn.lock ==="

cd "$REPO_ROOT/yarn-project"
echo "Running yarn install..."
yarn install

echo ""
echo "=== Verification ==="

cd "$REPO_ROOT"
if git status yarn-project/yarn.lock --porcelain | grep -q .; then
    echo "✓ yarn.lock was modified"
else
    echo "✓ yarn.lock unchanged (already up to date)"
fi

echo ""
echo "✓ Step 3 complete."
echo ""
echo "To commit (if changes): git add yarn-project/yarn.lock && git commit -m 'chore: Update yarn.lock for noir sync'"
