#!/usr/bin/env bash
set -euo pipefail

# Source ci3 framework
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

ci3/echo_header "CI3 Post-Actions"

# Read CI mode from env vars set by ci3.sh
ci_mode="${CI_MODE:-fast}"

# Get repository from git remote
github_repository=$(git remote get-url origin | sed -E 's|.*github\.com[/:]([^/]+/[^/]+)(\.git)?$|\1|')

# Save CI success marker for cache
mkdir -p .ci-cache
run_url="https://github.com/${github_repository}/actions/runs/${GITHUB_RUN_ID}"
echo "${run_url}" > ".ci-cache/ci-success-${ci_mode}.txt"
echo "Saved CI success marker: ${run_url}"

# Upload cache
cache_name="ci-success-${ci_mode}.tar.gz"
ci3/cache_upload "$cache_name" ".ci-cache/ci-success-${ci_mode}.txt" 2>&1 | grep -v "^$" || true

# If we have passed CI and labelled with ci-squash-and-merge, squash the PR.
# This will rerun CI on the squash commit - but is intended to be a no-op due to caching.
if [ "${SHOULD_SQUASH_MERGE}" -eq 1 ]; then
  echo "Processing squash and merge..."

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

echo ""
ci3/echo_header "Post-Actions Complete"
