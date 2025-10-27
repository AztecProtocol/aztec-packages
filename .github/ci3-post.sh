#!/usr/bin/env bash
set -euo pipefail

# Early exit if nothing to do
if [ "${SHOULD_SQUASH_MERGE:-0}" -eq 0 ] && [ "${SHOULD_UPLOAD_BENCHMARKS:-0}" -eq 0 ]; then
  exit 0
fi

# Get repository from git remote
github_repository=$(git remote get-url origin | sed -E 's|.*github\.com[/:]([^/]+/[^/]+)(\.git)?$|\1|')
echo "github_repository: ${github_repository}"

# Save CI success marker for cache (uses GitHub default GITHUB_RUN_ID)
run_url="https://github.com/${github_repository}/actions/runs/${GITHUB_RUN_ID}"
echo "${run_url}" > ci-success.txt
echo "Saved CI success marker: ${run_url}"

# If we have passed CI and labelled with ci-squash-and-merge, squash the PR.
# This will rerun CI on the squash commit - but is intended to be a no-op due to caching.
if [ "${SHOULD_SQUASH_MERGE}" -eq 1 ]; then
  echo "Processing squash and merge..."

  # Check squash-merge required env vars
  : "${GITHUB_TOKEN:?required}"
  : "${PR_NUMBER:?required}"
  : "${PR_HEAD_REF:?required}"
  : "${PR_BASE_REF:?required}"
  : "${PR_BASE_SHA:?required}"

  # Reauth the git repo with our GITHUB_TOKEN
  git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/${github_repository}

  # Get the base commit (merge-base) for the PR
  ./scripts/merge-train/squash-pr.sh \
    "${PR_NUMBER}" \
    "${PR_HEAD_REF}" \
    "${PR_BASE_REF}" \
    "${PR_BASE_SHA}"

  gh pr edit "${PR_NUMBER}" --remove-label "ci-squash-and-merge"
  gh pr merge "${PR_NUMBER}" --auto -m || true

  echo "Squash and merge completed"
fi

# Handle benchmarks download (internal only)
if [ "${SHOULD_UPLOAD_BENCHMARKS}" -eq 1 ] && [ "${CI_INTERNAL}" -eq 1 ]; then
  echo "Downloading benchmarks..."
  ./ci.sh gh-bench
  echo "Benchmarks download complete - upload will be handled by GitHub Action"
fi

echo "=== Post-action complete ==="
