#!/usr/bin/env bash

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

function get_meaningful_commits {
  local base="$1"
  local head="$2"

  git log --oneline --no-merges --reverse "${base}..${head}" \
    --pretty=format:"%s" | grep -v "^\[empty\]" || true
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
pr_number=$(echo "$pr_info" | jq -r '.number // empty')
if [[ -n "$pr_number" ]] && pr_has_auto_merge "$pr_number"; then
  echo "PR #$pr_number has auto-merge enabled, skipping merge from next"
  exit 0
fi

# Check if branch exists
if ! branch_exists "$TRAIN_BRANCH"; then
  echo "Branch $TRAIN_BRANCH does not exist yet, skipping merge"
  exit 0
fi

# Fetch and checkout the merge-train branch
git fetch origin "$TRAIN_BRANCH" || exit 1
git fetch origin next || exit 1
git checkout "$TRAIN_BRANCH" || exit 1

# Check if there are meaningful commits in next that aren't in the train branch
meaningful_commits=$(get_meaningful_commits "$TRAIN_BRANCH" "origin/next")

if [[ -z "$meaningful_commits" ]]; then
  echo "No meaningful commits found in next that aren't already in $TRAIN_BRANCH, skipping merge"
  exit 0
fi

echo "Found meaningful commits to merge:"
echo "$meaningful_commits"

# Attempt to merge next
if git merge "origin/next" --no-edit -m "Merge branch 'next' into $TRAIN_BRANCH"; then
  echo "Successfully merged next into $TRAIN_BRANCH"

  # Try to push directly first
  push_output=$(git push origin "$TRAIN_BRANCH" 2>&1) && push_ok=true || push_ok=false

  if [[ "$push_ok" == "true" ]]; then
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
    # Direct push failed (likely branch protection / ruleset).
    # Fall back to creating a PR with the merge.
    log_warn "Direct push to $TRAIN_BRANCH failed: $push_output"
    echo "Falling back to PR-based merge..."

    # Create a temporary branch for the merge PR
    temp_branch="auto-merge-next-to-${TRAIN_BRANCH//\//-}-$(date +%Y%m%d-%H%M%S)"
    git checkout -b "$temp_branch"
    if ! git push origin "$temp_branch"; then
      log_error "Failed to push temporary branch $temp_branch"
      exit 1
    fi

    # Check if there's already an open merge-next PR for this train branch
    existing_pr=$(gh pr list --state open --base "$TRAIN_BRANCH" --search "merge next into $TRAIN_BRANCH in:title" --json number --jq '.[0].number // empty' 2>/dev/null || true)
    if [[ -n "$existing_pr" ]]; then
      echo "Merge-next PR #$existing_pr already open for $TRAIN_BRANCH, updating it..."
      # Force-update the existing PR's branch
      gh pr checkout "$existing_pr"
      git reset --hard "$temp_branch"
      git push --force origin "HEAD:$(gh pr view "$existing_pr" --json headRefName --jq '.headRefName')"
      # Clean up temp branch
      git push origin --delete "$temp_branch" || true
      echo "Updated existing PR #$existing_pr"
    else
      # Create a PR to merge next into the train branch
      pr_url=$(gh pr create \
        --base "$TRAIN_BRANCH" \
        --head "$temp_branch" \
        --title "chore: merge next into $TRAIN_BRANCH" \
        --body "Automated merge of \`next\` into \`$TRAIN_BRANCH\`.

This PR was created because direct push to the train branch is blocked by branch protection rules." \
        --label "ci-no-squash" 2>&1)

      echo "Created merge PR: $pr_url"
    fi
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
