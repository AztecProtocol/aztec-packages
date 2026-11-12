#!/usr/bin/env bash
# Promotes a dev line (docs/lines/<line>/) into a release cut's main paths, pinned to the release tag.
# Only a cut's worktree ($CUT, from its env.sh) may run it: it rewrites main's pages. The promoted
# pages keep quoting docs/lines/<line>/ snippets, which include_code allows while both pins name one
# commit.
#
#   CUT=<cut worktree> docs/scripts/promote_line.sh <line> <tag>
set -euo pipefail

fail() {
  echo "promote_line: $*" >&2
  exit 1
}
unpin() {
  git -C "$root" checkout -q -- "docs/lines/$line/aztec-node.json"
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
compare() { gh api "repos/$repo/compare/$1...$2" --jq "$3"; }
status=$(compare "$line" "$commit" .status) || unpin "cannot compare $tag ($commit) with $repo's $line branch"
case "$status" in
  behind | identical) ;;
  diverged)
    # A release may be tagged on its own branch (v6.0.0 on release/6.0.0). Accept only the branch named for the
    # tag's version, and only when the tag's own commits are on neither the line nor the default branch: the
    # fork point alone cannot tell, since a line can leave the default branch after a release forks from it.
    release=release/${tag#v}
    rstatus=$(compare "$release" "$commit" .status) ||
      unpin "$tag ($commit) is not on $repo's $line branch (compare $line...$commit: diverged), nor on a $release branch"
    [[ "$rstatus" = behind || "$rstatus" = identical ]] ||
      unpin "$tag ($commit) is on neither $repo's $line nor its $release branch (compare $release...$commit: $rstatus)"
    default=$(gh api "repos/$repo" --jq .default_branch) || unpin "cannot read $repo's default branch"
    # The compare API lists at most 250 commits: refuse rather than check a truncated list.
    own=$(compare "$line" "$commit" 'if .ahead_by == (.commits | length) then .commits[].sha else error("truncated") end') ||
      unpin "cannot list $tag's commits that $line lacks"
    off_default=$(compare "$default" "$commit" 'if .ahead_by == (.commits | length) then .commits[].sha else error("truncated") end') ||
      unpin "cannot list $tag's commits that $default lacks"
    shared=$(grep -Fxv -f <(printf '%s\n' "$off_default") <<<"$own" || true)
    [ -z "$shared" ] || unpin "$release carries commits $default has ($(head -c 10 <<<"$shared")…): it is not a release branch of $line"
    read -r fork forked < <(compare "$line" "$commit" '"\(.merge_base_commit.sha) \(.merge_base_commit.commit.committer.date)"') ||
      unpin "cannot find where $release forks from $line"
    echo "$tag is on $repo's $release, which forks from $line at $fork ($forked). The tag's commits not on $line:"
    compare "$line" "$commit" '.commits[] | "  \(.sha[0:10]) \(.commit.message | split("\n")[0])"' || unpin "cannot list $tag's commits"
    ;;
  *) unpin "$tag ($commit) is not on $repo's $line branch (compare $line...$commit: $status)" ;;
esac

for tree in docs-developers docs-operate; do
  rm -rf "${docs:?}/$tree"
  cp -R "$line_root/$tree" "$docs/$tree"
done
cp "$line_root/sidebars-developer.js" "$line_root/sidebars-operate.js" "$docs/"
cp "$line_root/aztec-node.json" "$docs/aztec-node.json"
echo "promoted line $line at $tag into docs/: commit it as the promotion commit"
