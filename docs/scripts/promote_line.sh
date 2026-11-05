#!/usr/bin/env bash
# Promotes a dev line (docs/lines/<line>/) into the main paths of a release cut, at the cut's Step 2
# (release-docs, release-network-docs): it pins the line to the release tag, then replaces
# docs-developers/, docs-operate/ and both sidebars with the line's, and docs/aztec-node.json with the
# line's pin. Every later step reads the line's pages through the main paths. Their snippets keep
# quoting docs/lines/<line>/, which include_code allows while both pins name one commit.
#
#   CUT=<cut worktree> docs/scripts/promote_line.sh <line> <tag>
#
# It refuses, before writing anything, unless it runs in the worktree $CUT names (the cut's env.sh),
# docs/ is clean, and the tag has the line's major. After pinning, it refuses unless the pinned commit
# is on aztec-node's <line> branch. A refusal after the pin restores the line and leaves the main
# paths untouched.
set -euo pipefail

fail() {
  echo "promote_line: $*" >&2
  exit 1
}
unpin() {
  git -C "$root" checkout -q -- "docs/lines/$line"
  fail "$@"
}
[ $# -eq 2 ] || { echo "usage: CUT=<cut worktree> $0 <line> <tag>" >&2; exit 2; }
line=$1 tag=$2
docs=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
root=$(dirname "$docs")

[[ "$line" =~ ^v([0-9]+)$ ]] || fail "$line is not a line name (v<major>)"
major=${BASH_REMATCH[1]}
line_root=$docs/lines/$line
[ -f "$line_root/aztec-node.json" ] || fail "no line $line: docs/lines/$line/aztec-node.json is missing"
[ -n "${CUT:-}" ] && [ "$(cd "$CUT" 2>/dev/null && pwd -P)" = "$root" ] ||
  fail "this is $root, not the cut worktree: run it from the cut, with the cut's env.sh sourced (\$CUT)"
[ -z "$(git -C "$root" status --porcelain -- docs)" ] || fail "docs/ has uncommitted changes: commit or discard them first"
[[ "$tag" =~ ^v${major}\. ]] || fail "$tag is not a v$major release, and line $line takes only v$major tags"

node "$docs/scripts/aztec_node.mts" --line "$line" pin "$tag" || unpin "pinning line $line to $tag failed; the main paths are untouched"
# The commit the pin recorded, not the tag, which can move after the pin resolves it; and the
# repository the pin enforces, not the one the line named before.
read -r repo commit < <(node -p 'const p = require(process.argv[1]); new URL(p.repository).pathname.slice(1) + " " + p.commit' "$line_root/aztec-node.json")
status=$(gh api "repos/$repo/compare/$line...$commit" --jq .status) || unpin "cannot compare $tag ($commit) with $repo's $line branch"
case "$status" in
  behind | identical) ;;
  *) unpin "$tag ($commit) is not on $repo's $line branch (compare $line...$commit: $status)" ;;
esac

for tree in docs-developers docs-operate; do
  rm -rf "${docs:?}/$tree"
  cp -R "$line_root/$tree" "$docs/$tree"
done
cp "$line_root/sidebars-developer.js" "$line_root/sidebars-operate.js" "$docs/"
cp "$line_root/aztec-node.json" "$docs/aztec-node.json"
echo "promoted line $line at $tag into docs/: commit it as the promotion commit"
