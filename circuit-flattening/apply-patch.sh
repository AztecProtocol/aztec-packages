#!/usr/bin/env bash
# Apply the generator patch to the noir submodule working tree, so nargo can be
# built with the --show-monomorphized / --inline-monomorphized flags. This is
# the inverse of export-patch.sh, and the first step of a fresh setup:
#   ./apply-patch.sh
#   ./flatten-circuits.sh   # builds nargo + generates the artifacts
#
# Safe to re-run: if the patch is already applied it reports that and exits 0.
# If the patch no longer fits (the submodule has moved), it stops and points to
# the recovery instructions instead of leaving a half-applied tree.
set -euo pipefail

FLAT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$FLAT/.." && pwd)"
NOIR="$ROOT/noir/noir-repo"
PATCH="$FLAT/noir-circuit-flattening.patch"

# If the patch can be reversed, it is already applied.
if git -C "$NOIR" apply --reverse --check "$PATCH" 2>/dev/null; then
  echo "patch already applied to $NOIR — nothing to do."
  exit 0
fi

if ! git -C "$NOIR" apply --check "$PATCH" 2>/dev/null; then
  echo "error: patch does not apply cleanly to $NOIR." >&2
  echo "       The submodule has likely advanced since the patch was recorded." >&2
  echo "       See \"If the patch no longer applies\" in README.md." >&2
  exit 1
fi

git -C "$NOIR" apply "$PATCH"
echo "applied patch to $NOIR. Next: ./flatten-circuits.sh"
