#!/usr/bin/env bash
# Verify that the npm tarball this package would publish includes every
# vendored sqlite3mc artifact listed in vendor/jswasm/SHA256SUMS.
#
# Background: npm honors any `.gitignore` it finds inside directories listed
# in the `files` allowlist. The `.gitignore` in vendor/jswasm/ excludes
# everything except an allowlist (SHA256SUMS, the locally-authored .d.mts,
# and itself), which inadvertently strips the WASM/MJS artifacts from the
# published tarball even though they're present on disk after vendor.sh ran.
#
# vendor/jswasm/.npmignore shadows that .gitignore for npm pack purposes.
# This script is the guard that catches any future regression. For example:
# someone deletes the .npmignore, or a new vendored file is added but not
# captured by whatever inclusion mechanism is in place. Wired into
# `prepublishOnly` so a broken tarball aborts publish before upload.
#
# Exit codes: 0 = all expected files present, 1 = missing files, 2 = setup
# error (no SHA256SUMS, npm pack failed, etc.).

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PKG_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
SHA256SUMS="$PKG_ROOT/vendor/jswasm/SHA256SUMS"

if [[ ! -f "$SHA256SUMS" ]]; then
  echo "verify-pack: SHA256SUMS not found at $SHA256SUMS" >&2
  echo "  Run scripts/vendor.sh first to populate vendor/jswasm/." >&2
  exit 2
fi

# Parse SHA256SUMS for the list of files that MUST appear in the tarball.
# Each line is "<sha256>  <filename>". We want the filename, prefixed with
# the package-relative path that npm uses inside the tarball.
expected=()
while IFS= read -r line; do
  fname=$(awk '{print $2}' <<<"$line")
  [[ -n "$fname" ]] || continue
  expected+=("vendor/jswasm/$fname")
done < "$SHA256SUMS"

if [[ ${#expected[@]} -eq 0 ]]; then
  echo "verify-pack: SHA256SUMS contained no entries, nothing to verify" >&2
  exit 2
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

# Build the same tarball `npm publish` would upload, then list its contents.
# `--dry-run --json` output format varies across npm versions; running real
# `npm pack` and untarring is stable across npm 7+.
echo "==> Running npm pack to build a candidate tarball"
(cd "$PKG_ROOT" && npm pack --pack-destination "$WORK_DIR" >/dev/null)
TARBALL=$(find "$WORK_DIR" -maxdepth 1 -name '*.tgz' | head -n 1)
if [[ -z "$TARBALL" ]]; then
  echo "verify-pack: npm pack produced no tarball in $WORK_DIR" >&2
  exit 2
fi

# Tarball entries are prefixed with "package/" — strip for comparison.
tar tzf "$TARBALL" | sed 's|^package/||' > "$WORK_DIR/listing"

missing=0
for f in "${expected[@]}"; do
  if ! grep -Fxq "$f" "$WORK_DIR/listing"; then
    echo "verify-pack: missing from tarball: $f" >&2
    missing=1
  fi
done

if [[ "$missing" -eq 1 ]]; then
  cat >&2 <<EOF

verify-pack: one or more vendored sqlite3mc artifacts were filtered out of
  the npm tarball. Most likely cause: vendor/jswasm/.npmignore is missing,
  letting the sibling .gitignore strip the WASM/MJS artifacts at pack time.

  To diagnose:
    cd $PKG_ROOT
    npm pack --dry-run 2>&1 | grep vendor/jswasm

  Tarball file listing (for reference): $WORK_DIR/listing
EOF
  # Don't auto-clean WORK_DIR on failure so the operator can inspect.
  trap - EXIT
  echo "verify-pack: leaving $WORK_DIR for inspection" >&2
  exit 1
fi

echo "verify-pack: all ${#expected[@]} vendored files present in tarball"
