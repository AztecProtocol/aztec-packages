#!/usr/bin/env bash
set -euo pipefail

# CI3 Post-Action Script
# This script handles post-CI tasks like squash-and-merge and benchmarks
#
# Expected environment variables:
#   CI_INTERNAL: "1" for internal runs, "0" for external runs (default: 0)
#   SHOULD_SQUASH_MERGE: "1" if should squash and merge, "0" otherwise (default: 0)
#   SHOULD_UPLOAD_BENCHMARKS: "1" if should upload benchmarks, "0" otherwise (default: 0)
#   GITHUB_TOKEN: GitHub token for API operations
#
# For squash-and-merge:
#   PR_NUMBER: PR number
#   PR_HEAD_REF: PR head ref
#   PR_BASE_REF: PR base ref
#   PR_BASE_SHA: PR base SHA

: "${CI_INTERNAL:=0}"
: "${SHOULD_SQUASH_MERGE:=0}"
: "${SHOULD_UPLOAD_BENCHMARKS:=0}"

echo "=== CI3 Post-Action Script ==="
echo "CI_INTERNAL: ${CI_INTERNAL}"
echo "SHOULD_SQUASH_MERGE: ${SHOULD_SQUASH_MERGE}"
echo "SHOULD_UPLOAD_BENCHMARKS: ${SHOULD_UPLOAD_BENCHMARKS}"

# Early exit if nothing to do
if [ "${SHOULD_SQUASH_MERGE}" -eq 0 ] && [ "${SHOULD_UPLOAD_BENCHMARKS}" -eq 0 ]; then
  echo "Nothing to do, exiting"
  exit 0
fi

# Get repository from git remote
GITHUB_REPOSITORY=$(git remote get-url origin | sed -E 's|.*github\.com[/:]([^/]+/[^/]+)(\.git)?$|\1|')
echo "GITHUB_REPOSITORY: ${GITHUB_REPOSITORY}"

# Handle squash and merge
if [ "${SHOULD_SQUASH_MERGE}" -eq 1 ]; then
  echo "Processing squash and merge..."

  # Reauth the git repo with our GITHUB_TOKEN
  git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}

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
