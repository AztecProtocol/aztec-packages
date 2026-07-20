#!/usr/bin/env bash
# Fetch the sqlite3mc WASM release into vendor/jswasm/.
#
# Two modes:
#
#   scripts/vendor.sh
#     Fetches the version pinned in scripts/vendor.pin, replacing vendor/jswasm/
#     with pristine upstream files and regenerating SHA256SUMS. Used at build
#     time and when bumping the pinned version.
#
#   scripts/vendor.sh ensure
#     Idempotent: if vendor/jswasm/ is already populated and verifies against
#     SHA256SUMS, exits 0 without touching anything. Otherwise behaves like the
#     no-arg form. Wired into yarn-project/bootstrap.sh to populate vendor files
#     on fresh checkouts before compilation.
#
#   scripts/vendor.sh <mc-version> <sqlite-version> <expected-sha256>
#     Override pin file. Used to verify a candidate release before editing the
#     pin file. Does NOT update the pin file, that's a manual step.
#
# After bumping: edit scripts/vendor.pin, run scripts/vendor.sh (no args),
# commit pin + SHA256SUMS together.

set -euo pipefail

# Resolve package root relative to this script so the script works from any cwd.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PKG_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

LOCAL_DMTS="$PKG_ROOT/vendor/jswasm/sqlite3.d.mts"
LOCAL_GITIGNORE="$PKG_ROOT/vendor/jswasm/.gitignore"
LOCAL_NPMIGNORE="$PKG_ROOT/vendor/jswasm/.npmignore"
SHA256SUMS="$PKG_ROOT/vendor/jswasm/SHA256SUMS"
PIN_FILE="$SCRIPT_DIR/vendor.pin"

# `ensure` mode: short-circuit if vendor files are already present and verify.
if [[ "${1:-}" == "ensure" ]]; then
  if [[ -f "$SHA256SUMS" ]] && (cd "$PKG_ROOT/vendor/jswasm" && sha256sum --status -c SHA256SUMS) 2>/dev/null; then
    exit 0
  fi
  shift
fi

# Resolve pin: explicit args override pin file.
if [[ $# -eq 3 ]]; then
  MC_VERSION=$1
  SQLITE_VERSION=$2
  EXPECTED_SHA=$3
elif [[ $# -eq 0 ]]; then
  if [[ ! -f "$PIN_FILE" ]]; then
    echo "Pin file not found at $PIN_FILE" >&2
    exit 2
  fi
  # shellcheck disable=SC1090
  source "$PIN_FILE"
  MC_VERSION=${MC_VERSION:-}
  SQLITE_VERSION=${SQLITE_VERSION:-}
  EXPECTED_SHA=${SHA256:-}
  if [[ -z "$MC_VERSION" || -z "$SQLITE_VERSION" || -z "$EXPECTED_SHA" ]]; then
    echo "Pin file $PIN_FILE missing MC_VERSION / SQLITE_VERSION / SHA256" >&2
    exit 2
  fi
else
  echo "usage: $0 [ensure] [<mc-version> <sqlite-version> <expected-sha256>]" >&2
  echo "  no args:   fetch the version pinned in scripts/vendor.pin" >&2
  echo "  ensure:    no-op if files already verify; else fetch from pin" >&2
  echo "  3 args:    override pin (used to verify a candidate release)" >&2
  exit 2
fi

ASSET="sqlite3mc-${MC_VERSION}-sqlite-${SQLITE_VERSION}-wasm.zip"
URL="https://github.com/utelle/SQLite3MultipleCiphers/releases/download/v${MC_VERSION}/${ASSET}"

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

echo "==> Downloading ${ASSET}"
# Retries cover transient DNS / TLS failures on CI runners — a one-off
# `Could not resolve host: release-assets.githubusercontent.com` here has
# dequeued the merge train.
curl -fsSL --retry 5 --retry-delay 2 --retry-all-errors --retry-connrefused \
  -o "$WORK_DIR/$ASSET" "$URL"

echo "==> Verifying zip SHA256"
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

# Preserve files that aren't part of the upstream release across re-vendoring:
#   - sqlite3.d.mts: locally-authored TypeScript declaration
#   - .gitignore: allowlist that keeps upstream artifacts untracked
#   - .npmignore: shadows .gitignore so npm publish keeps the artifacts
DMTS_BACKUP=""
if [[ -f "$LOCAL_DMTS" ]]; then
  DMTS_BACKUP=$(mktemp)
  cp "$LOCAL_DMTS" "$DMTS_BACKUP"
fi
GITIGNORE_BACKUP=""
if [[ -f "$LOCAL_GITIGNORE" ]]; then
  GITIGNORE_BACKUP=$(mktemp)
  cp "$LOCAL_GITIGNORE" "$GITIGNORE_BACKUP"
fi
NPMIGNORE_BACKUP=""
if [[ -f "$LOCAL_NPMIGNORE" ]]; then
  NPMIGNORE_BACKUP=$(mktemp)
  cp "$LOCAL_NPMIGNORE" "$NPMIGNORE_BACKUP"
fi

echo "==> Replacing vendor/jswasm/ with pristine upstream files"
rm -rf "$PKG_ROOT/vendor/jswasm"
mkdir -p "$PKG_ROOT/vendor/jswasm"
cp -r "$EXTRACTED/jswasm/." "$PKG_ROOT/vendor/jswasm/"

# Restore preserved files.
if [[ -n "$DMTS_BACKUP" ]]; then
  cp "$DMTS_BACKUP" "$LOCAL_DMTS"
  rm "$DMTS_BACKUP"
  echo "==> Restored locally-authored sqlite3.d.mts"
fi
if [[ -n "$GITIGNORE_BACKUP" ]]; then
  cp "$GITIGNORE_BACKUP" "$LOCAL_GITIGNORE"
  rm "$GITIGNORE_BACKUP"
  echo "==> Restored .gitignore"
fi
if [[ -n "$NPMIGNORE_BACKUP" ]]; then
  cp "$NPMIGNORE_BACKUP" "$LOCAL_NPMIGNORE"
  rm "$NPMIGNORE_BACKUP"
  echo "==> Restored .npmignore"
fi

echo "==> Generating vendor/jswasm/SHA256SUMS"
(cd "$PKG_ROOT/vendor/jswasm" && sha256sum -- * 2>/dev/null | sort -k2 > SHA256SUMS)
# Exclude SHA256SUMS from itself (sha256sum already skipped it since it didn't exist yet,
# but guard against re-runs where it would).
grep -v " SHA256SUMS$" "$PKG_ROOT/vendor/jswasm/SHA256SUMS" > "$PKG_ROOT/vendor/jswasm/SHA256SUMS.tmp"
mv "$PKG_ROOT/vendor/jswasm/SHA256SUMS.tmp" "$PKG_ROOT/vendor/jswasm/SHA256SUMS"

echo "==> Done. Updated files:"
ls "$PKG_ROOT/vendor/jswasm/" | sed 's/^/    /'
