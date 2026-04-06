#!/usr/bin/env bash
# Netlify build script for preview deploys
# Installs nargo and generates aztec-nr API docs before building
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Installing noirup and nargo ==="
export PATH="$HOME/.nargo/bin:$PATH"

# Ensure noir submodule is available for version detection
REPO_ROOT="$DOCS_ROOT/.."
if [ ! -f "$REPO_ROOT/noir/noir-repo/.git" ] && [ ! -d "$REPO_ROOT/noir/noir-repo/.git" ]; then
    git -C "$REPO_ROOT" submodule update --init --depth 1 noir/noir-repo
fi

# Use the pinned noir version from the submodule (falls back to nightly)
NOIR_TAG=$(git -C "$REPO_ROOT/noir/noir-repo" describe --tags --exact-match 2>/dev/null || echo "nightly")
echo "Using noir version: $NOIR_TAG"

# Install noirup (ignore shell detection failure - binary still gets installed)
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash || true
noirup -v "$NOIR_TAG"

# Verify nargo version matches expected tag — stale Netlify cache can leave an old binary
INSTALLED_VERSION=$(nargo --version 2>/dev/null | head -1 || echo "none")
if ! echo "$INSTALLED_VERSION" | grep -q "$NOIR_TAG"; then
    echo "WARNING: nargo version mismatch (expected $NOIR_TAG, got $INSTALLED_VERSION)"
    echo "Forcing clean reinstall..."
    rm -rf "$HOME/.nargo"
    export PATH="$HOME/.nargo/bin:$PATH"
    curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash || true
    noirup -v "$NOIR_TAG"
fi

echo "=== Verifying nargo installation ==="
nargo --version

echo "=== Generating aztec-nr API documentation ==="
"$SCRIPT_DIR/aztec_nr_docs_generation/generate_aztec_nr_docs.sh"

echo "=== Running yarn build ==="
cd "$DOCS_ROOT"
yarn build
