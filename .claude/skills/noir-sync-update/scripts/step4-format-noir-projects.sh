#!/bin/bash
set -euo pipefail

# Step 4: Format noir-projects

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

echo "=== Step 4: Format noir-projects ==="

cd "$REPO_ROOT/noir-projects"
echo "Running ./bootstrap.sh format..."
./bootstrap.sh format

echo ""
echo "=== Verification ==="

cd "$REPO_ROOT"
if git status noir-projects/ --porcelain | grep -q .; then
    echo "✓ Formatting changes detected:"
    git status noir-projects/ --short
    echo ""
    echo "To commit: git add noir-projects/ && git commit -m 'chore: Format noir-projects for noir sync'"
else
    echo "✓ No formatting changes needed"
fi

echo ""
echo "✓ Step 4 complete."
