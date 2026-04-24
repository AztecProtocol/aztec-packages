#!/usr/bin/env bash
# Re-vendor the sqlite3mc WASM release into vendor/jswasm/.
#
# Usage:
#   scripts/vendor.sh <sqlite3mc-version> <sqlite-version> <expected-sha256>
#
# Example (verify the current pinned version):
#   scripts/vendor.sh 2.2.4 3.50.4 e73514200d76286d7d4a239589589b4f64d24ac4f4f7b2760e1f07b14ac5f6a5
#
# The script fetches
#   https://github.com/utelle/SQLite3MultipleCiphers/releases/download/v<ver>/
#     sqlite3mc-<ver>-sqlite-<sqlite-ver>-wasm.zip
# verifies the SHA256 matches, unzips, and copies the jswasm/ contents into
# vendor/jswasm/ replacing what was there. Exits non-zero on any failure.
#
# After running, update README.md's provenance table with the new version/hash.

set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: $0 <sqlite3mc-version> <sqlite-version> <expected-sha256>" >&2
  echo "example: $0 2.2.4 3.50.4 e73514200d76286d7d4a239589589b4f64d24ac4f4f7b2760e1f07b14ac5f6a5" >&2
  exit 2
fi

MC_VERSION=$1
SQLITE_VERSION=$2
EXPECTED_SHA=$3

# Resolve package root relative to this script so the script works from any cwd.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PKG_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

ASSET="sqlite3mc-${MC_VERSION}-sqlite-${SQLITE_VERSION}-wasm.zip"
URL="https://github.com/utelle/SQLite3MultipleCiphers/releases/download/v${MC_VERSION}/${ASSET}"

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

echo "==> Downloading ${ASSET}"
curl -fsSL -o "$WORK_DIR/$ASSET" "$URL"

echo "==> Verifying SHA256"
ACTUAL_SHA=$(sha256sum "$WORK_DIR/$ASSET" | awk '{print $1}')
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  echo "SHA256 mismatch!" >&2
  echo "  expected: $EXPECTED_SHA" >&2
  echo "  actual:   $ACTUAL_SHA"   >&2
  echo "Either upstream re-released the asset, or the artifact was tampered with." >&2
  echo "Investigate before updating." >&2
  exit 1
fi
echo "    $ACTUAL_SHA  (match)"

echo "==> Extracting"
unzip -q "$WORK_DIR/$ASSET" -d "$WORK_DIR"
# Extracted directory name is derived from sqlite version (e.g. sqlite3mc-wasm-3500400)
EXTRACTED=$(find "$WORK_DIR" -maxdepth 1 -type d -name 'sqlite3mc-wasm-*' | head -n 1)
if [[ -z "$EXTRACTED" ]]; then
  echo "Extracted archive doesn't contain expected sqlite3mc-wasm-* directory" >&2
  exit 1
fi

echo "==> Replacing vendor/jswasm/"
rm -rf "$PKG_ROOT/vendor/jswasm"
mkdir -p "$PKG_ROOT/vendor/jswasm"
cp -r "$EXTRACTED/jswasm/." "$PKG_ROOT/vendor/jswasm/"

echo "==> Done. Updated files:"
ls "$PKG_ROOT/vendor/jswasm/" | sed 's/^/    /'

echo ""
echo "Next steps:"
echo "  1. Update yarn-project/sqlite3mc-wasm/README.md provenance table"
echo "     (sqlite3mc version, SQLite version, SHA256)"
echo "  2. Re-run kv-store tests to confirm the new WASM is compatible:"
echo "       yarn workspace @aztec/kv-store test:browser"
echo "  3. Commit the updated vendor/ + README.md"
