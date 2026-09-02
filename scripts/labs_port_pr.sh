#!/usr/bin/env bash
# Port an aztec-packages PR to aztec-node: checks that the PR only touches the labs half of the
# tree, replays its diff onto aztec-node main in a temporary worktree of the labs/ submodule's
# repository, and leaves a branch ready to push. Two shapes of PR are accepted:
#   - the in-tree layout (v5 lines, next before the split): paths under the labs directories
#     map 1:1 onto aztec-node and the diff is applied with a 3-way merge;
#   - the submodule layout (next after the split): the PR adds or changes labs-patches/*.patch,
#     and those patches are applied as they are (the diff of the patch files is ignored).
# Anything outside those paths aborts with the offending files listed: a mixed PR is split by
# its author, not guessed at here.
#
#   usage: scripts/labs_port_pr.sh <pr number|url> [--onto <aztec-node ref>] [--branch <name>]
#          scripts/labs_port_pr.sh --diff <file> --title <title> [--onto ...] [--branch ...] [--no-fetch]
# Nothing is pushed; the commands to push and open the aztec-node PR are printed.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
labs=$root/labs
upstream_repo=aztec-labs-eng/aztec-node
labs_dirs=(yarn-project noir-projects/labs docs playground spartan aztec-up release-image labs-aztec-toolchain)
foundation_refs='noir-projects/fnd|barretenberg/|l1-contracts/|protocol/constants-codegen|ipc-runtime/|wsdb/'

pr="" onto=origin/main branch="" diff_file="" title="" fetch=1
while [ $# -gt 0 ]; do
  case "$1" in
    --onto) onto=$2; shift 2 ;;
    --branch) branch=$2; shift 2 ;;
    --diff) diff_file=$2; shift 2 ;;
    --title) title=$2; shift 2 ;;
    --no-fetch) fetch=0; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) pr=$1; shift ;;
  esac
done
function die { echo "labs_port_pr: $*" >&2; exit 1; }
[ -n "$pr" ] || [ -n "$diff_file" ] || die "usage: $0 <pr number|url> | --diff <file> --title <title>"
[ -e "$labs/.git" ] || die "labs/ is not checked out; run labs-patches/bootstrap.sh apply first"

tmp=$(mktemp -d)
done_ok=0
function cleanup {
  rm -rf "$tmp"; git -C "$labs" worktree prune
  # A branch is only worth keeping with the port committed on it.
  [ "$done_ok" = 1 ] || { [ -z "${branch:-}" ] || git -C "$labs" branch -q -D "$branch" 2>/dev/null || true; }
}
trap cleanup EXIT

# --- the change to port ------------------------------------------------------------------
if [ -n "$pr" ]; then
  pr=${pr##*/}
  title=$(gh pr view "$pr" --json title --jq .title)
  gh pr diff "$pr" > "$tmp/pr.diff"
  suffix=" (AztecProtocol/aztec-packages#$pr)"
  branch=${branch:-port/pr-$pr}
else
  cp "$diff_file" "$tmp/pr.diff"
  [ -n "$title" ] || die "--title is required with --diff"
  suffix=""
  branch=${branch:-port/$(basename "$diff_file" .diff)}
fi
files=()
while IFS= read -r f; do files+=("$f"); done < <(grep -E '^diff --git a/' "$tmp/pr.diff" | sed -E 's#^diff --git a/(.*) b/.*#\1#' | sort -u)
[ "${#files[@]}" -gt 0 ] || die "the diff is empty"

# --- scope check: every path must be labs-owned, in one of the two layouts --------------------
intree=() patches=() other=()
for f in ${files[@]+"${files[@]}"}; do
  case "$f" in
    labs-patches/*.patch) patches+=("$f") ;;
    *)
      hit=0
      for d in "${labs_dirs[@]}"; do case "$f" in "$d"/*) hit=1; break ;; esac; done
      if [ $hit -eq 1 ]; then intree+=("$f"); else other+=("$f"); fi ;;
  esac
done
if [ "${#other[@]}" -gt 0 ]; then
  echo "labs_port_pr: the PR touches files outside the labs half of the tree; split it before porting:" >&2
  printf '  %s\n' ${other[@]+"${other[@]}"} >&2
  exit 1
fi
if [ "${#intree[@]}" -gt 0 ] && [ "${#patches[@]}" -gt 0 ]; then
  die "the PR mixes in-tree labs files and labs-patches/*.patch; port the two halves separately"
fi

# --- replay onto aztec-node main --------------------------------------------------------------
[ "$fetch" = 0 ] || git -C "$labs" fetch -q origin main
git -C "$labs" worktree prune
if git -C "$labs" show-ref -q --verify "refs/heads/$branch"; then
  die "branch $branch already exists in labs/; pick another with --branch or delete it"
fi
git -C "$labs" worktree add -q -b "$branch" "$tmp/wt" "$onto"
wt=$tmp/wt
conflicts=""
if [ "${#patches[@]}" -gt 0 ]; then
  # The PR's patch files are the port: apply the new versions (from the PR head) in order.
  head=$(gh pr view "$pr" --json headRefOid --jq .headRefOid)
  git -C "$root" fetch -q origin "$head"
  for p in ${patches[@]+"${patches[@]}"}; do
    git -C "$root" show "$head:$p" > "$tmp/$(basename "$p")" 2>/dev/null || continue   # deleted in the PR
    grep -q '^diff --git' "$tmp/$(basename "$p")" || continue
    if ! git -C "$wt" -c commit.gpgsign=false am -q --3way "$tmp/$(basename "$p")"; then
      conflicts+=" $(basename "$p")"
      git -C "$wt" am --abort || true
    fi
  done
  [ -z "$conflicts" ] || die "patches did not apply on $onto:$conflicts — rebase them in labs/ first (apply, fix up, export)"
else
  # aztec-node keeps noir-projects at its root (this repo's noir-projects/labs/<x> is its
  # noir-projects/<x>); every other path is identical in both layouts. --3way adapts to
  # context that moved upstream. The merge needs the diff's pre-image blobs, which live in
  # this repository, not aztec-node's: copy the ones this checkout has (the PR head is
  # fetched so they normally all are).
  sed -i.orig -E \
    -e 's#^(diff --git a/|--- a/|rename from |rename to |copy from |copy to )noir-projects/labs/#\1noir-projects/#' \
    -e 's#( b/)noir-projects/labs/#\1noir-projects/#' "$tmp/pr.diff"
  [ -z "$pr" ] || git -C "$root" fetch -q origin "refs/pull/$pr/head" || true
  blobs=$( { grep -E '^index [0-9a-f]+\.\.[0-9a-f]+' "$tmp/pr.diff" || true; } | sed -E 's/^index ([0-9a-f]+)\.\.([0-9a-f]+).*/\1 \2/' | tr ' ' '\n' | grep -v '^0*$' | sort -u || true)
  for blob in $blobs; do
    git -C "$root" cat-file -e "$blob" 2>/dev/null || continue
    git -C "$root" cat-file blob "$blob" | git -C "$wt" hash-object -w --stdin >/dev/null
  done
  if ! git -C "$wt" apply --3way --index "$tmp/pr.diff" 2>"$tmp/apply.err"; then
    conflicts=$(git -C "$wt" diff --name-only --diff-filter=U)
    if [ -z "$conflicts" ]; then cat "$tmp/apply.err" >&2; die "diff did not apply on $onto"; fi
  fi
  git -C "$wt" add -A
  git -C "$wt" -c commit.gpgsign=false commit -q --allow-empty -m "$title$suffix" \
    -m "Ported from AztecProtocol/aztec-packages${pr:+#$pr}."
fi

# --- report ----------------------------------------------------------------------------------
done_ok=1
echo "Prepared $branch on $onto ($(git -C "$wt" rev-parse --short HEAD)): $title"
if [ -n "$conflicts" ]; then
  echo "CONFLICTS left in the worktree for these files (markers committed; fix in labs/ on branch $branch):"
  echo "$conflicts" | sed 's/^/  /'
fi
if grep -E "^\+.*($foundation_refs)" "$tmp/pr.diff" >/dev/null; then
  echo "Lines referencing foundation-only paths were ported verbatim; check them, aztec-node has no such tree:"
  grep -nE "^\+.*($foundation_refs)" "$tmp/pr.diff" | sed 's/^/  /' | head -20
fi
echo "  git -C labs push origin $branch"
echo "  gh pr create --repo $upstream_repo --head $branch --base main --fill"
