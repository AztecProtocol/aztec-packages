#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/merge-train-lib.sh"

# Methods used from merge-train-lib.sh:
# - get_meaningful_commits: Get non-merge, non-empty commits

# Usage: update-pr-body.sh <branch-name>
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <branch-name>"
  echo "Example: $0 merge-train/docs"
  exit 1
fi

BRANCH="$1"

# Find the open PR for this branch
pr_info=$(gh pr list --state open --head "$BRANCH" --json number,baseRefName --jq '.[0]')

if [[ -z "$pr_info" ]]; then
  echo "No open PR found for $BRANCH, skipping update"
  exit 0
fi

pr_number=$(echo "$pr_info" | jq -r '.number')
base_branch=$(echo "$pr_info" | jq -r '.baseRefName')

echo "Updating PR #$pr_number body for branch $BRANCH"

# Get base SHA for comparison
base_sha=$(gh api "repos/{owner}/{repo}/pulls/$pr_number" --jq '.base.sha')
head_sha=$(gh api "repos/{owner}/{repo}/pulls/$pr_number" --jq '.head.sha')

# Get commits
commits=$(get_meaningful_commits "$base_sha" "$head_sha")

# Format commits or show placeholder
if [[ -n "$commits" ]]; then
  formatted_commits="$commits"
else
  formatted_commits="*No commits yet*"
fi

# Update PR body
new_body="See [merge-train-readme.md](https://github.com/${GITHUB_REPOSITORY}/blob/next/.github/workflows/merge-train-readme.md).

$formatted_commits"

gh pr edit "$pr_number" --body "$new_body"

echo "PR #$pr_number body updated"
