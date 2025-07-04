#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/merge-train-lib.sh"

# Methods used from merge-train-lib.sh:
# - log_info: Log informational messages
# - pr_has_auto_merge: Check if a PR has auto-merge enabled
# - enable_auto_merge: Enable auto-merge for a PR (includes approval if needed)

# Constants
INACTIVITY_HOURS="${INACTIVITY_HOURS:-4}"
INACTIVITY_SECONDS=$((INACTIVITY_HOURS * 3600))

function get_merge_train_prs {
  gh pr list --state open --json number,headRefName,updatedAt \
    --jq '.[] | select(.headRefName | startswith("merge-train/"))'
}

function get_meaningful_commits_for_pr {
  local pr_number="$1"

  # Get all commits with dates and filter out merges and empty commits
  gh api "repos/{owner}/{repo}/pulls/$pr_number/commits" --paginate \
    --jq '.[] | select(.parents | length == 1) | select(.commit.message | test("^\\[empty\\]") | not) | "\(.sha)|\(.commit.committer.date)"'
}

function get_last_meaningful_commit_info {
  local pr_number="$1"

  local commits=$(get_meaningful_commits_for_pr "$pr_number")
  if [[ -z "$commits" ]]; then
    echo ""
    return
  fi

  # Find the most recent commit by date
  local latest_date=""
  local latest_sha=""
  while IFS='|' read -r sha date; do
    if [[ -z "$latest_date" ]] || [[ "$date" > "$latest_date" ]]; then
        latest_date="$date"
        latest_sha="$sha"
    fi
  done <<< "$commits"

  echo "$latest_sha|$latest_date"
}

function has_merge_queue_failure {
  local commit_sha="$1"

  if [[ -z "$commit_sha" ]]; then
    return 1
  fi

  # Check for merge queue failure in check runs for the commit
  local failures=$(gh api "repos/{owner}/{repo}/commits/$commit_sha/check-runs" \
    --jq '.check_runs[] | select(.name | contains("merge-queue") or contains("Merge queue")) | select(.conclusion == "failure") | .name')

  [[ -n "$failures" ]]
}

function is_pr_inactive {
  local last_commit_date="$1"

  if [[ -z "$last_commit_date" ]]; then
    return 1
  fi

  # Cross-platform date parsing
  local last_commit_timestamp
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS BSD date
    last_commit_timestamp=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$last_commit_date" +%s 2>/dev/null ||  date -j -f "%Y-%m-%d %H:%M:%S" "$last_commit_date" +%s)
  else
    # GNU date
    last_commit_timestamp=$(date -d "$last_commit_date" +%s)
  fi

  local current_timestamp=$(date +%s)
  local time_diff=$((current_timestamp - last_commit_timestamp))

  [[ $time_diff -gt $INACTIVITY_SECONDS ]]
}

# Start execution
log_info "Starting auto-merge check for inactive merge-train PRs"
log_info "Inactivity threshold: $INACTIVITY_HOURS hours"

prs=$(get_merge_train_prs)

if [[ -z "$prs" ]]; then
  log_info "No merge-train PRs found"
  exit 0
fi

while IFS= read -r pr_json; do
  pr_number=$(echo "$pr_json" | jq -r '.number')
  branch=$(echo "$pr_json" | jq -r '.headRefName')

  log_info "Checking PR #$pr_number ($branch)"

  # Get last meaningful commit info (SHA and date)
  commit_info=$(get_last_meaningful_commit_info "$pr_number")

  if [[ -z "$commit_info" ]]; then
    log_info "PR #$pr_number has no meaningful commits, skipping"
    continue
  fi

  # Split the commit info
  latest_sha="${commit_info%%|*}"
  last_commit_date="${commit_info##*|}"

  # Check for merge queue failures on the latest commit
  if has_merge_queue_failure "$latest_sha"; then
    log_info "PR #$pr_number has merge queue failures, skipping auto-merge"
    continue
  fi

  if is_pr_inactive "$last_commit_date"; then
    log_info "PR #$pr_number has been inactive since $last_commit_date"

    # Check if already has auto-merge
    if pr_has_auto_merge "$pr_number"; then
        log_info "PR #$pr_number already has auto-merge enabled"
    else
        enable_auto_merge "$pr_number"
        gh pr comment "$pr_number" --body "🤖 Auto-merge enabled after $INACTIVITY_HOURS hours of inactivity. This PR will be merged automatically once all checks pass."
    fi
  else
    log_info "PR #$pr_number is still active (last commit: $last_commit_date)"
  fi
done <<< "$prs"

log_info "Auto-merge check completed"
