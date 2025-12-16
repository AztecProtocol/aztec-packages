#!/bin/bash

set -euo pipefail

# Function to get meaningful commits (non-merge, non-empty)
function get_meaningful_commits {
  local base="$1"
  local head="$2"

  git log --oneline --no-merges --reverse "${base}..${head}" \
    --pretty=format:"%s" | grep -v "^\[empty\]" || true
}

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

BEGIN_COMMIT_OVERRIDE
$formatted_commits
END_COMMIT_OVERRIDE"

gh pr edit "$pr_number" --body "$new_body"

echo "PR #$pr_number body updated"
