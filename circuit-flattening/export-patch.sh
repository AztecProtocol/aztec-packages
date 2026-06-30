#!/usr/bin/env bash
# Re-export the noir submodule's generator changes into
# noir-circuit-flattening.patch.
#
# Run this ONLY after editing the generator code in the noir submodule working
# tree. The generator is never committed to noir; this patch is its sole
# committed record, so re-exporting keeps the patch in sync with the code that
# actually produced the artifacts.
#
# Safety, in two layers:
#   1. It refuses to write when the submodule diff is empty or suspiciously
#      small — protecting against running it against a clean submodule (e.g.
#      before ./apply-patch.sh), which would otherwise replace the real patch
#      with nothing.
#   2. It asks for confirmation before overwriting, because a diff of the right
#      size could still be the wrong thing (e.g. the generator plus unrelated
#      submodule changes). Pass --yes/-y to skip the prompt in scripts; run
#      non-interactively without it and the script refuses rather than guess.
set -euo pipefail

ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=true ;;
    *) echo "usage: $0 [--yes]" >&2; exit 2 ;;
  esac
done

FLAT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$FLAT/.." && pwd)"
NOIR="$ROOT/noir/noir-repo"
PATCH="$FLAT/noir-circuit-flattening.patch"

# The committed patch is ~1800 lines; a clean tree gives 0 and even a partial
# generator gives hundreds. Anything below this is a clean/broken tree, not a
# real export.
MIN_LINES=200

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# Intent-to-add so the untracked inliner.rs is included in the diff, then undo
# the staging so the submodule index is left untouched.
git -C "$NOIR" add -N compiler/noirc_frontend/src/monomorphization/inliner.rs 2>/dev/null || true
git -C "$NOIR" diff > "$tmp"
git -C "$NOIR" reset -q

lines=$(wc -l < "$tmp")
if [ "$lines" -lt "$MIN_LINES" ]; then
  echo "error: submodule diff is only $lines lines (expected >= $MIN_LINES)." >&2
  echo "       Refusing to overwrite $PATCH with a clean/partial tree." >&2
  echo "       Did you run ./apply-patch.sh and edit the generator?" >&2
  exit 1
fi

if [ "$ASSUME_YES" != true ]; then
  echo "About to overwrite the committed patch:"
  echo "  $PATCH"
  echo "with a $lines-line diff from $NOIR."
  echo
  echo "This is correct ONLY if that diff IS the generator — i.e. you ran"
  echo "./apply-patch.sh this session and then edited the generator code. If you"
  echo "did not apply the patch, or the submodule has unrelated changes, this"
  echo "would replace the committed patch with the wrong contents."
  echo
  if [ ! -t 0 ]; then
    echo "error: not running interactively; re-run with --yes if you are sure." >&2
    exit 1
  fi
  read -r -p "Overwrite the committed patch? [y/N] " reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) echo "aborted; patch left unchanged."; exit 1 ;;
  esac
fi

mv "$tmp" "$PATCH"
trap - EXIT
echo "exported patch: $lines lines -> $PATCH"
