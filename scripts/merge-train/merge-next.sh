#!/bin/bash

set -euo pipefail

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

function log_error {
  echo -e "${RED}[ERROR]${NC} $*"
}

function log_warn {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

function get_pr_for_branch {
  local branch="$1"
  gh pr list --state open --head "$branch" --json number,autoMergeRequest --jq '.[0]'
}

function pr_has_auto_merge {
  local pr_number="$1"
  local result=$(gh pr view "$pr_number" --json autoMergeRequest --jq '.autoMergeRequest')
  [[ -n "$result" ]]
}

function branch_exists {
  local branch="$1"
  git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1
}

function get_pr_merge_commits {
  local pr_number="$1"
  gh api "repos/{owner}/{repo}/pulls/$pr_number/commits" --jq '.[] | select(.parents | length > 1) | .sha'
}

function cancel_ci_runs {
  local commit_sha="$1"
  local workflow_file="${2:-ci3.yml}"

  echo "Looking for runs to cancel for commit $commit_sha"

  local runs=$(gh run list --commit "$commit_sha" --workflow "$workflow_file" --status in_progress --json databaseId --jq '.[].databaseId')

  if [[ -n "$runs" ]]; then
    for run_id in $runs; do
        echo "Cancelling run $run_id"
        gh run cancel "$run_id" || log_warn "Failed to cancel run $run_id"
    done
  else
    echo "No active runs found for commit $commit_sha"
  fi
}

# Usage: merge-next.sh <train-branch>
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <train-branch>"
  echo "Example: $0 merge-train/docs"
  exit 1
fi

TRAIN_BRANCH="$1"

# Check if PR has auto-merge enabled
pr_info=$(get_pr_for_branch "$TRAIN_BRANCH")
if [[ -n "$pr_info" ]]; then
  pr_number=$(echo "$pr_info" | jq -r '.number // empty')
  if [[ -n "$pr_number" ]] && pr_has_auto_merge "$pr_number"; then
    echo "PR #$pr_number has auto-merge enabled, skipping merge from next"
    exit 0
  fi
fi

# Check if branch exists
if ! branch_exists "$TRAIN_BRANCH"; then
  echo "Branch $TRAIN_BRANCH does not exist yet, skipping merge"
  exit 0
fi

# Fetch and checkout the merge-train branch
git fetch origin "$TRAIN_BRANCH" || exit 1
git checkout "$TRAIN_BRANCH" || exit 1

# Attempt to merge next
if git merge "origin/next" --no-edit -m "Merge branch 'next' into $TRAIN_BRANCH"; then
  echo "Successfully merged next into $TRAIN_BRANCH"

  # Try to push
  if git push origin "$TRAIN_BRANCH"; then
    echo "Successfully pushed to $TRAIN_BRANCH"
    pushed_sha=$(git rev-parse HEAD)

    # Cancel old CI runs on merge commits
    if [[ -n "${pr_number:-}" ]]; then
        echo "Cancelling old CI runs for PR #$pr_number"

        # Get all merge commits except the one we just pushed
        merge_commits=$(get_pr_merge_commits "$pr_number")
        for commit in $merge_commits; do
          if [[ "$commit" != "$pushed_sha" ]]; then
            cancel_ci_runs "$commit"
          fi
        done
    fi
  else
    log_error "Failed to push to $TRAIN_BRANCH"
    exit 1
  fi
else
  # Merge failed, capture conflict details before aborting
  conflicts=$(git diff --name-only --diff-filter=U)
  git merge --abort || true
  log_error "Merge conflicts detected:"
  echo "$conflicts"

  # Create conflict comment
  conflict_comment="## ⚠️ Auto-merge to ${TRAIN_BRANCH} failed

Merge conflicts detected when merging \`next\` into \`${TRAIN_BRANCH}\`.

**Conflicted files:**
\`\`\`
${conflicts}
\`\`\`

Please resolve the conflicts manually."

  # Post comment on the most recent commit on next
  latest_commit=$(gh api repos/{owner}/{repo}/commits/next --jq '.sha')
  gh api "repos/{owner}/{repo}/commits/${latest_commit}/comments" \
    -f body="$conflict_comment"

  log_error "Merge failed due to conflicts"
  exit 1
fi
