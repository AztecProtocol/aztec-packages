#!/usr/bin/env bash
# Post-job: Squash and merge PR if labeled with ci-squash-and-merge.
# Env: SHOULD_SQUASH_MERGE, PR_NUMBER, PR_HEAD_REF, PR_BASE_REF, PR_BASE_SHA, GITHUB_TOKEN
set -euo pipefail

if [ "${SHOULD_SQUASH_MERGE:-0}" -eq 0 ]; then
  exit 0
fi

echo "Processing squash and merge..."

# Reauth the git repo with our GITHUB_TOKEN
local_repo=$(git remote get-url origin | sed -E 's|.*github\.com[/:]([^/]+/[^/]+)(\.git)?$|\1|')
git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${local_repo}"

./scripts/merge-train/squash-pr.sh \
  "${PR_NUMBER}" \
  "${PR_HEAD_REF}" \
  "${PR_BASE_REF}" \
  "${PR_BASE_SHA}"

gh pr edit "${PR_NUMBER}" --remove-label "ci-squash-and-merge"
gh pr merge "${PR_NUMBER}" --auto -m || true

echo "Squash and merge completed"
