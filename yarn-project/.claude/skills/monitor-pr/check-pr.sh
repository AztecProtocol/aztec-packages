#!/usr/bin/env bash
# check-pr.sh — print a parseable status snapshot for a PR, used by the monitor-pr skill.
#
# Reports, on stdout, key=value lines the calling agent can grep:
#   PR=<n> STATE=<OPEN|...> HEAD=<branch> BASE=<branch>
#   MERGEABLE=<MERGEABLE|CONFLICTING|UNKNOWN> MERGE_STATE=<CLEAN|DIRTY|BLOCKED|BEHIND|...>
#   HAS_BASE_MERGE_COMMITS=<yes|no|unknown>   # branch already merged the base in -> prefer `git merge` over rebase
#   CI=<PENDING|PASS|FAIL|NONE>
#   STATUS=<one-line human summary>
# Followed by a FAILED_CHECKS block (name<TAB>bucket<TAB>link), one per line, only when CI=FAIL.
#
# Dependencies: gh, git, jq. Run from anywhere inside the repo clone.
# Usage: check-pr.sh [PR_NUMBER]   (PR number optional; defaults to the PR for the current branch)

set -uo pipefail

REPO="${MONITOR_PR_REPO:-AztecProtocol/aztec-packages}"
PR="${1:-}"

die() { echo "ERROR=$*"; exit 1; }

command -v gh  >/dev/null 2>&1 || die "gh not found on PATH"
command -v git >/dev/null 2>&1 || die "git not found on PATH"
command -v jq  >/dev/null 2>&1 || die "jq not found on PATH"

# Resolve the PR. With no argument, ask gh for the PR tied to the current branch.
VIEW_JSON="$(gh pr view ${PR:+$PR} --repo "$REPO" \
  --json number,state,headRefName,baseRefName,mergeable,mergeStateStatus 2>/dev/null)" \
  || die "could not resolve PR (pass a PR number, or check out the PR branch). repo=$REPO arg='${PR}'"

PR_NUM="$(jq -r '.number'           <<<"$VIEW_JSON")"
STATE="$(jq -r '.state'             <<<"$VIEW_JSON")"
HEAD_REF="$(jq -r '.headRefName'    <<<"$VIEW_JSON")"
BASE_REF="$(jq -r '.baseRefName'    <<<"$VIEW_JSON")"
MERGEABLE="$(jq -r '.mergeable'     <<<"$VIEW_JSON")"
MERGE_STATE="$(jq -r '.mergeStateStatus' <<<"$VIEW_JSON")"

echo "PR=$PR_NUM"
echo "STATE=$STATE"
echo "HEAD=$HEAD_REF"
echo "BASE=$BASE_REF"
echo "MERGEABLE=$MERGEABLE"
echo "MERGE_STATE=$MERGE_STATE"

# Does the PR branch already contain merge commit(s) from the base?
# If so, the monitor-pr skill prefers `git merge origin/<base>` over a rebase.
# Evaluate against the PR's actual head tip (origin/<head>) so the answer is correct even when a
# different branch is checked out locally; fall back to local HEAD only if the remote head is
# unavailable.
HAS_BASE_MERGES="unknown"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git fetch --quiet origin "$BASE_REF" >/dev/null 2>&1 || true
  git fetch --quiet origin "$HEAD_REF" >/dev/null 2>&1 || true
  HEAD_TIP=""
  if git rev-parse --verify --quiet "origin/$HEAD_REF" >/dev/null 2>&1; then
    HEAD_TIP="origin/$HEAD_REF"
  elif git rev-parse --verify --quiet HEAD >/dev/null 2>&1; then
    HEAD_TIP="HEAD"
  fi
  if [ -n "$HEAD_TIP" ] && git rev-parse --verify --quiet "origin/$BASE_REF" >/dev/null 2>&1; then
    if [ -n "$(git log --merges "origin/$BASE_REF..$HEAD_TIP" --format='%H' 2>/dev/null)" ]; then
      HAS_BASE_MERGES="yes"
    else
      HAS_BASE_MERGES="no"
    fi
  fi
fi
echo "HAS_BASE_MERGE_COMMITS=$HAS_BASE_MERGES"

# CI checks. bucket is one of: pass, fail, pending, skipping, cancel.
CHECKS_JSON="$(gh pr checks "$PR_NUM" --repo "$REPO" --json name,bucket,link 2>/dev/null)"
if [ -z "$CHECKS_JSON" ] || [ "$CHECKS_JSON" = "[]" ]; then
  CI="NONE"
elif jq -e 'any(.[]; .bucket=="fail" or .bucket=="cancel")' <<<"$CHECKS_JSON" >/dev/null; then
  CI="FAIL"
elif jq -e 'any(.[]; .bucket=="pending")' <<<"$CHECKS_JSON" >/dev/null; then
  CI="PENDING"
else
  CI="PASS"
fi
echo "CI=$CI"

# Human-readable one-liner.
CONFLICT_NOTE=""
if [ "$MERGEABLE" = "CONFLICTING" ] || [ "$MERGE_STATE" = "DIRTY" ]; then
  CONFLICT_NOTE=" CONFLICTS"
fi
echo "STATUS=PR #$PR_NUM ($HEAD_REF -> $BASE_REF): CI=$CI mergeable=$MERGEABLE$CONFLICT_NOTE"

# Emit the failing checks for the fixer agent to act on.
if [ "$CI" = "FAIL" ]; then
  echo "FAILED_CHECKS_BEGIN"
  jq -r '.[] | select(.bucket=="fail" or .bucket=="cancel")
         | [.name, .bucket, (.link // "")] | @tsv' <<<"$CHECKS_JSON"
  echo "FAILED_CHECKS_END"
fi
