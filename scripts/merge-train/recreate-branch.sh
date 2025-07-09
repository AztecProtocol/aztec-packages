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
MERGE_COMMIT="$3" # the commit in the base branch containing our squashed changes
HEAD_COMMIT="$4"  # the head commit SHA of the pre-merge PR

# Ensure required token is set
if [[ -z "${GH_TOKEN:-}" ]]; then
  log_error "GH_TOKEN is not set. This should be set to AZTEC_BOT_GITHUB_TOKEN."
  exit 1
fi

# Fetch latest state
git fetch origin "$MT" || exit 1
git fetch origin "$BASE" || exit 1

# Rebuild merge-train branch
git checkout -B "$MT" "origin/$BASE"
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

  # Check if branch has commits from the old merge-train
  PR_BASE=$(git merge-base "$MERGE_COMMIT" "$HEAD_COMMIT")
  # Check: Has this PR already pulled in commits that were on the old merge-train?
  #
  # 1.  List all commit-ids that are in the PR but not in $BASE
  # 2.  For each of those commit-ids, ask: “is that commit reachable from $BR?” if so, we have history from the old merge-train.
  if git log --format=%H "$PR_BASE..$HEAD_COMMIT" | grep -qFf <(git log --format=%H "$BR"); then
    # Branch has commits from the old merge-train, add comment
    TIPS="This had commits from $MT but it has now been squashed.
Consider running the following commands to rebase onto the new $MT:
\`\`\`
# Merge the old PR head before recreation.
# If you currently have conflicts, you will resolve them here.
git merge $HEAD_COMMIT
# Rebase onto $BASE, ignoring commits received from the old $MT.
git rebase --onto \$(git merge-base $HEAD_COMMIT $BASE) $MERGE_COMMIT
\`\`\`
If that has given you trouble, you can also try:

"

    gh pr comment "$PR_NUM" --body "$TIPS"
    echo "✓ Added rebase instructions comment to PR #$PR_NUM"
  else
    echo "✓ PR #$PR_NUM does not contain commits from old $MT, no comment needed"
  fi

done
