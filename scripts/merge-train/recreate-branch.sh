#!/bin/bash

set -euo pipefail

# This script uses AZTEC_BOT_GITHUB_TOKEN for all operations including PR creation

# Colors for output
RED='\033[0;31m'
NC='\033[0m'

function log_error {
  echo -e "${RED}[ERROR]${NC} $*"
}

set -x

# Usage: recreate-branch.sh <merge-train-branch> <base-branch> <merge-commit> <head-commit>
if [[ $# -ne 4 ]]; then
  echo "Usage: $0 <merge-train-branch> <base-branch> <merge-commit> <head-commit>"
  echo "Example: $0 merge-train/docs next abc123 def456"
  exit 1
fi

MT="$1"           # merge-train/* branch that was just merged
BASE="$2"         # base branch (usually next)
MERGE_COMMIT="$3" # the merge commit in the base branch
HEAD_COMMIT="$4"  # the head commit SHA of the pre-merge PR

# Ensure required token is set
if [[ -z "${GH_TOKEN:-}" ]]; then
  log_error "GH_TOKEN is not set. This should be set to AZTEC_BOT_GITHUB_TOKEN."
  exit 1
fi

# Fetch latest state
git fetch origin "$HEAD_COMMIT" || exit 1
git fetch origin "$MERGE_COMMIT" || exit 1

# Create backup of the branch before recreating it
echo "Creating backup of branch '$MT' as '${MT}-previous'"
git push --force origin "refs/remotes/origin/$MT:refs/heads/${MT}-previous" 2>/dev/null || echo "Warning: Failed to create backup (branch may not exist)"

# Rebuild merge-train branch from the merge commit
# This preserves the full history since we're using regular merges
git checkout -B "$MT" "$MERGE_COMMIT"
git commit --allow-empty -m "[empty] Start merge-train. Choo choo."
git push -f origin "$MT"

# Create new PR using AZTEC_BOT_GITHUB_TOKEN
gh pr create --base "$BASE" --head "$MT" \
  --title "feat: $MT" \
  --body "$(echo -e "See [merge-train-readme.md](https://github.com/${GITHUB_REPOSITORY}/blob/next/.github/workflows/merge-train-readme.md).\nThis is a merge-train with no commits.")"

# Merge every other open PR that targets the merge-train
PR_LIST=$(gh pr list --state open --base "$MT" \
  --json number,headRefName \
  --jq '.[] | "\(.number):\(.headRefName)"')

for PR_DATA in $PR_LIST; do
  PR_NUM="${PR_DATA%%:*}"
  BR="${PR_DATA#*:}"

  echo "Processing PR #$PR_NUM (branch: $BR)"

  # Skip if we can't fetch the branch
  if ! git fetch origin "$BR" 2>/dev/null; then
    echo "✗ Could not fetch branch $BR for PR #$PR_NUM, skipping"
    continue
  fi

  # Try to checkout
  if ! git checkout "$BR" 2>/dev/null; then
    echo "✗ Could not checkout branch $BR for PR #$PR_NUM, skipping"
    continue
  fi

  # With regular merges, we don't need complex rebase instructions
  # PRs targeting the merge train will automatically have the latest changes
  echo "✓ PR #$PR_NUM targets $MT branch"

done
