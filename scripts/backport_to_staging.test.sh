#!/usr/bin/env bash
# Tests the safety gate backport_to_staging.sh uses when a cherry-pick produces
# an empty result: before declaring "already present in the target; nothing to
# port", the script now requires the PR's own diff (merge^1..merge) to
# reverse-apply against the target. This test pins that gate's decision on the
# two target states an empty pick can hide:
#   1. the change genuinely IS in the target  -> reverse-apply succeeds -> skip
#   2. the change is NOT in the target (washed -> reverse-apply fails    -> surface
#      out by the merge, i.e. a silent drop)
# It also shows the OLD heuristic (no unmerged paths) cannot tell them apart.
set -euo pipefail

test_root="/tmp/backport-staging-test-$$"
passed=0
failed=0

cleanup() { rm -rf "$test_root"; }
trap cleanup EXIT

log() { echo -e "\033[1m$1\033[0m"; }
pass() { echo -e "  \033[32m✓ $1\033[0m"; ((++passed)); }
fail() { echo -e "  \033[31m✗ $1\033[0m"; ((++failed)); }

# Mirrors the gate in backport_to_staging.sh: given the PR's introduced patch and
# a checked-out target working tree, decide whether the change is already present.
# Returns 0 (skip: present) or 1 (surface: absent), matching the script's branch.
already_present() {
  local pr_patch="$1"
  [[ -z "$pr_patch" ]] && return 0
  git apply --reverse --check <<<"$pr_patch" 2>/dev/null
}

setup_repo() {
  local dir="$1"
  rm -rf "$dir"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" config user.email test@test
  git -C "$dir" config user.name test
  printf '1\n2\n3\n' > "$dir/foo.txt"
  git -C "$dir" add foo.txt
  git -C "$dir" commit -qm base
}

# The change a merged PR introduces: append a "4" line to foo.txt.
pr_patch_for() {
  local dir="$1"
  git -C "$dir" diff HEAD -- foo.txt
}

log "Test 1: change already in target -> gate says skip"
repo="$test_root/present"
setup_repo "$repo"
pushd "$repo" >/dev/null
# Build the PR patch (append "4"), then land that exact change on the target.
printf '1\n2\n3\n4\n' > foo.txt
PATCH=$(pr_patch_for "$repo")
git commit -qam "land the change on target"   # target now genuinely contains it
if already_present "$PATCH"; then
  pass "reverse-apply succeeds; already-present change is skipped"
else
  fail "gate refused a change that is genuinely present (false surface)"
fi
popd >/dev/null

log "Test 2: change absent from target -> gate says surface (no silent drop)"
repo="$test_root/absent"
setup_repo "$repo"
pushd "$repo" >/dev/null
# Same PR patch, but the target never received the change (foo.txt is still base).
printf '1\n2\n3\n4\n' > foo.txt
PATCH=$(pr_patch_for "$repo")
git checkout -q -- foo.txt                     # target lacks the change
# Old heuristic: an empty pick leaves no unmerged paths, so it would skip blindly.
if [[ -z "$(git diff --name-only --diff-filter=U)" ]]; then
  pass "old heuristic (no unmerged paths) would have skipped this silently"
else
  fail "unexpected unmerged paths in fixture"
fi
# New gate: the change is absent, so reverse-apply must fail and we surface it.
if already_present "$PATCH"; then
  fail "gate skipped a change absent from the target (silent drop)"
else
  pass "reverse-apply fails; absent change is surfaced, not swallowed"
fi
popd >/dev/null

echo
log "Passed: $passed  Failed: $failed"
[[ $failed -eq 0 ]]
