#!/bin/bash

set -euo pipefail

# Function to check if a PR has auto-merge enabled
function pr_has_auto_merge {
  local pr_number="$1"
  local result=$(gh pr view "$pr_number" --json autoMergeRequest --jq '.autoMergeRequest')
  [[ -n "$result" ]]
}

# Function to enable auto-merge for a PR (includes approval if needed)
function enable_auto_merge {
  local pr_number="$1"

  local reviews=$(gh pr view "$pr_number" --json reviews --jq '.reviews[] | select(.state == "APPROVED")')
  if [[ -z "$reviews" ]]; then
    echo "Approving PR #$pr_number"
    gh pr review "$pr_number" --approve --body "🤖 Auto-approved"
  fi

  echo "Enabling auto-merge for PR #$pr_number"
  gh pr merge "$pr_number" --auto --merge
}

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
echo "Starting auto-merge check for inactive merge-train PRs"
echo "Inactivity threshold: $INACTIVITY_HOURS hours"

prs=$(get_merge_train_prs)

if [[ -z "$prs" ]]; then
  echo "No merge-train PRs found"
  exit 0
fi

while IFS= read -r pr_json; do
  pr_number=$(echo "$pr_json" | jq -r '.number')
  branch=$(echo "$pr_json" | jq -r '.headRefName')

  echo "Checking PR #$pr_number ($branch)"

  # Get last meaningful commit info (SHA and date)
  commit_info=$(get_last_meaningful_commit_info "$pr_number")

  if [[ -z "$commit_info" ]]; then
    echo "PR #$pr_number has no meaningful commits, skipping"
    continue
  fi

  # Split the commit info
  latest_sha="${commit_info%%|*}"
  last_commit_date="${commit_info##*|}"

  # Check if the last merge queue run failed
  echo "Checking last merge queue run for PR #$pr_number"

  # Get the most recent completed CI3 merge queue run for this PR
  last_mq_run=$(gh api "repos/{owner}/{repo}/actions/runs?event=merge_group&per_page=50" \
    --jq '.workflow_runs[] | select(.head_commit.message | contains("#'$pr_number'")) | select(.status == "completed") | select(.name == "CI3") | {conclusion: .conclusion, name: .name}' 2>/dev/null | head -1)

  if [[ -n "$last_mq_run" ]]; then
    last_mq_conclusion=$(echo "$last_mq_run" | jq -r '.conclusion // empty')
    if [[ "$last_mq_conclusion" == "failure" ]] || [[ "$last_mq_conclusion" == "cancelled" ]]; then
      echo "PR #$pr_number last merge queue run failed ($last_mq_conclusion), skipping auto-merge"
      continue
    fi
  fi

  if is_pr_inactive "$last_commit_date"; then
    echo "PR #$pr_number has been inactive since $last_commit_date"

    # Check if already has auto-merge
    if pr_has_auto_merge "$pr_number"; then
        echo "PR #$pr_number already has auto-merge enabled"
    else
        enable_auto_merge "$pr_number"
        gh pr comment "$pr_number" --body "🤖 Auto-merge enabled after $INACTIVITY_HOURS hours of inactivity. This PR will be merged automatically once all checks pass."
    fi
  else
    echo "PR #$pr_number is still active (last commit: $last_commit_date)"
  fi
done <<< "$prs"

echo "Auto-merge check completed"
