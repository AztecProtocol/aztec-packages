#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/merge-train-lib.sh"

set -x

# Methods used from merge-train-lib.sh:
# - log_info, log_error: Logging functions

# Usage: recreate-branch.sh <merge-train-branch> <base-branch>
if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <merge-train-branch> <base-branch>"
  echo "Example: $0 merge-train/docs next"
  exit 1
fi

MT="$1"    # merge-train/* branch that was just merged
BASE="$2"    # base branch (usually next)

# Fetch latest state
git fetch origin "$MT" || exit 1
git fetch origin "$BASE" || exit 1
SHA=$(git rev-parse "origin/$MT")  # save old head

# Rebuild merge-train branch
git checkout -B "$MT" "origin/$BASE"
git commit --allow-empty -m "[empty] Start merge-train. Choo choo."
git push -f origin "$MT"

# Create new PR
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

  # Try to merge with the old SHA
  if git merge -q "$SHA" && git merge -q -X ours "origin/$BASE"; then
    if git push origin "$BR" 2>/dev/null; then
        echo "✓ PR #$PR_NUM merged successfully"
    else
        echo "✗ Could not push to $BR for PR #$PR_NUM"
    fi
  else
    git merge --abort || true
    echo "✗ PR #$PR_NUM has conflicts, skipping"
  fi
done

