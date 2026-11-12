#!/usr/bin/env bash
# pin_doc_references - The docs pages a pin move reaches
#
# Prints `<reference> -> <page>, <page>` for each labs/ reference in a line's pages whose files differ
# between an older aztec-node commit and the line's pinned one: the pages to review with the
# update-doc-references skill in the change that moves the pin.
#
# Usage: pin_doc_references.sh [--line <line>] [<old-commit>]
#
#   --line <line>  a dev line (docs/lines/<line>/: its pages, pin and checkout); default: main's
#   <old-commit>   the aztec-node commit the pin moved from, 40 hex characters; default: the one the
#                  line's pin file names at `git merge-base origin/next HEAD`. A release cut passes it,
#                  since a line cut moves the line into main's paths.
#
# Reads the checkout `aztec_node.mts fetch` keeps, fetching <old-commit> into it at depth 1 when absent.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(git rev-parse --show-toplevel)"
# shellcheck source-path=SCRIPTDIR source=lib/extract_doc_references.sh
source "$SCRIPT_DIR/lib/extract_doc_references.sh"
# shellcheck source-path=SCRIPTDIR source=lib/aztec_node.sh
source "$SCRIPT_DIR/lib/aztec_node.sh"

function usage {
  sed -n '2,/^set -e/p' "$SCRIPT_DIR/pin_doc_references.sh" | sed '$d; s/^# \{0,1\}//' >&2
  exit 2
}

function die {
  echo "pin_doc_references: $*" >&2
  exit 1
}

function pin_commit {
  node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf8")).commit)'
}

COMMIT='^[0-9a-f]{40}$'
LINE=
if [[ ${1:-} == --line ]]; then
  [[ ${2:-} =~ ^v[0-9]+$ ]] || usage
  LINE=$2
  shift 2
fi
[[ $# -le 1 ]] || usage
[[ $# -eq 0 || $1 =~ $COMMIT ]] || usage
DOCS_DIR=docs${LINE:+/lines/$LINE}
PIN_FILE=$DOCS_DIR/aztec-node.json

require_aztec_node "$LINE"
new=$(pin_commit <"$PIN_FILE")
if [[ $# -eq 1 ]]; then
  old=$1
else
  base=$(git merge-base origin/next HEAD) || die "no merge base with origin/next: run git fetch origin next, or pass the old commit"
  pinned=$(git show "$base:$PIN_FILE" 2>/dev/null) || die "$PIN_FILE does not exist at $base: pass the old commit"
  old=$(pin_commit <<<"$pinned")
  [[ $old =~ $COMMIT ]] || die "$PIN_FILE at $base names no commit"
fi
if [[ $old == "$new" ]]; then
  echo "pin_doc_references: $PIN_FILE still pins $new" >&2
  exit 0
fi

git -C "$AZTEC_NODE_DIR" cat-file -e "$old^{commit}" 2>/dev/null ||
  git -C "$AZTEC_NODE_DIR" fetch -q --depth 1 --no-tags origin --end-of-options "$old" ||
  die "cannot fetch $old from $(git -C "$AZTEC_NODE_DIR" remote get-url origin): pass an aztec-node commit"

changed=$(mktemp)
mapping=$(mktemp)
trap 'rm -f "$changed" "$mapping"' EXIT
# --no-renames: a rename would list only the new path, and pages reference the old one. -z: git
# C-quotes a name holding `"` or `\` even with core.quotePath=false.
git -C "$AZTEC_NODE_DIR" diff -z --no-renames --name-only "$old" "$new" -- | tr '\0' '\n' | sed 's|^|labs/|' >"$changed"
extract_references_mapping "$DOCS_DIR" "$mapping"
found=$(changed_references "$mapping" "$changed")
[[ -z $found ]] || printf '%s\n' "$found"
echo "pin_doc_references: $(grep -c . <<<"$found" || true) reference(s) reached between $old and $new;" \
  "diff one with: git -C $AZTEC_NODE_DIR diff $old $new -- <path without labs/ and /*>" >&2
