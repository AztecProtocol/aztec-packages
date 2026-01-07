#!/bin/bash
set -euo pipefail

# Step 2: Update Cargo.lock in avm-transpiler
# Only updates noir-repo dependencies, not all dependencies

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

echo "=== Step 2: Update avm-transpiler Cargo.lock ==="

# Get expected version from noir-repo
MANIFEST="$REPO_ROOT/noir/noir-repo/.release-please-manifest.json"
if [[ ! -f "$MANIFEST" ]]; then
    echo "ERROR: Cannot find $MANIFEST"
    exit 1
fi

EXPECTED_VERSION=$(grep -o '"\.": "[^"]*"' "$MANIFEST" | head -1 | cut -d'"' -f4)
echo "Expected noir version from .release-please-manifest.json: $EXPECTED_VERSION"

# Check current version in Cargo.lock (using first noir package we find)
CARGO_LOCK="$REPO_ROOT/avm-transpiler/Cargo.lock"
CARGO_TOML="$REPO_ROOT/avm-transpiler/Cargo.toml"

# Extract noir-repo package names from Cargo.toml path dependencies
# Look for lines like: package_name = { path = "../noir/noir-repo/..." }
NOIR_PACKAGES=$(grep 'path = "../noir/noir-repo' "$CARGO_TOML" | sed 's/^\([a-zA-Z_-]*\).*/\1/')

if [[ -z "$NOIR_PACKAGES" ]]; then
    echo "ERROR: No noir-repo dependencies found in $CARGO_TOML"
    exit 1
fi

echo ""
echo "Found noir-repo dependencies in Cargo.toml:"
echo "$NOIR_PACKAGES" | sed 's/^/  - /'

# Get the first package to check current version
FIRST_PACKAGE=$(echo "$NOIR_PACKAGES" | head -1)
CURRENT_VERSION=$(grep -A1 "^name = \"$FIRST_PACKAGE\"$" "$CARGO_LOCK" | grep 'version' | head -1 | cut -d'"' -f2)
echo ""
echo "Current $FIRST_PACKAGE version in Cargo.lock: $CURRENT_VERSION"

echo ""
echo "Updating noir-repo packages..."

# Build cargo update command with -p flags for each package
cd "$REPO_ROOT/avm-transpiler"
CARGO_UPDATE_ARGS=""
for pkg in $NOIR_PACKAGES; do
    CARGO_UPDATE_ARGS="$CARGO_UPDATE_ARGS -p $pkg"
done

# shellcheck disable=SC2086
cargo update $CARGO_UPDATE_ARGS

echo ""
echo "=== Verification ==="

# Verify the version is correct
NEW_VERSION=$(grep -A1 "^name = \"$FIRST_PACKAGE\"$" "$CARGO_LOCK" | grep 'version' | head -1 | cut -d'"' -f2)
echo "New $FIRST_PACKAGE version in Cargo.lock: $NEW_VERSION"

if [[ "$NEW_VERSION" != "$EXPECTED_VERSION" ]]; then
    echo "ERROR: Version mismatch! Expected $EXPECTED_VERSION but got $NEW_VERSION"
    exit 1
fi
echo "✓ Version matches expected"

# Check git status
cd "$REPO_ROOT"
if git status avm-transpiler/Cargo.lock --porcelain | grep -q .; then
    echo "✓ Cargo.lock was modified"
else
    echo "✓ Cargo.lock unchanged (already up to date)"
fi

# Verify it still builds
echo ""
echo "Running cargo check to verify build..."
cd "$REPO_ROOT/avm-transpiler"
cargo check

echo ""
echo "✓ Step 2 complete."
echo ""
echo "To commit (if changes): git add avm-transpiler/Cargo.lock && git commit -m 'chore: Update avm-transpiler Cargo.lock for noir sync'"
