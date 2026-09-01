#!/bin/bash
# After a merge-train branch merges and is recreated, wake up PRs targeting it
# by adding the ci-wakeup-pr-after-merge label. This triggers a CI re-run via
# the labeled event. The label is removed immediately by ci3.yml so it can be
# re-applied next time.
#
# Usage: wakeup-prs.sh <merge-train-branch>
# Example: wakeup-prs.sh merge-train/spartan

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <merge-train-branch>"
  exit 1
fi

MERGE_TRAIN_BRANCH="$1"

echo "Looking for PRs to wake up targeting: $MERGE_TRAIN_BRANCH"

# Query all open PRs targeting this branch
prs=$(gh pr list \
  --base "$MERGE_TRAIN_BRANCH" \
  --state open \
  --json number,autoMergeRequest,statusCheckRollup \
  --jq '.[]')

if [[ -z "$prs" ]]; then
  echo "No open PRs found targeting $MERGE_TRAIN_BRANCH"
  exit 0
fi

echo "$prs" | jq -c '.' | while IFS= read -r pr_json; do
  pr_number=$(echo "$pr_json" | jq -r '.number')

  # Check if automerge is enabled
  auto_merge=$(echo "$pr_json" | jq -r '.autoMergeRequest')
  if [[ "$auto_merge" == "null" || -z "$auto_merge" ]]; then
    echo "PR #$pr_number: automerge not enabled, skipping"
    continue
  fi

  # Check if CI check has passed
  ci_conclusion=$(echo "$pr_json" | jq -r '
    [.statusCheckRollup[] | select(.__typename == "CheckRun") | select(.name == "ci")] |
    if length > 0 then .[0].conclusion else "NONE" end
  ')
  if [[ "$ci_conclusion" != "SUCCESS" ]]; then
    echo "PR #$pr_number: CI not passed (conclusion: $ci_conclusion), skipping"
    continue
  fi

  echo "PR #$pr_number: CI passed and automerge enabled, adding wakeup label"
  # REST, not `gh pr edit --add-label`: the latter's GraphQL query needs the `read:org` scope
  # AZTEC_BOT_GITHUB_TOKEN does not carry.
  jq -n '{ labels: ["ci-wakeup-pr-after-merge"] }' \
    | gh api --method POST "repos/{owner}/{repo}/issues/$pr_number/labels" --input - >/dev/null || {
    echo "WARNING: Failed to add label to PR #$pr_number"
  }
done

echo "Wakeup check completed"
