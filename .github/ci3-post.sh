#!/usr/bin/env bash
set -euo pipefail

# Source ci3 framework
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

save_cache() {
  local ci_mode="$1"
  local github_repository="$2"

  local run_url="https://github.com/${github_repository}/actions/runs/${GITHUB_RUN_ID}"
  echo "${run_url}" > ".ci-success.txt"
  echo "Saved CI success marker: ${run_url}"

  local cache_name="ci-success-${ci_mode}.tar.gz"
  cache_upload "$cache_name" ".ci-success.txt" 2>&1 | grep -v "^$" || true
}

handle_squash_merge() {
  local github_repository="$1"

  if [ "${SHOULD_SQUASH_MERGE:-0}" -eq 0 ]; then
    return
  fi

  echo "Processing squash and merge..."

  : "${GITHUB_TOKEN:?required}"
  : "${PR_NUMBER:?required}"
  : "${PR_HEAD_REF:?required}"
  : "${PR_BASE_REF:?required}"
  : "${PR_BASE_SHA:?required}"

  git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/${github_repository}

  ./scripts/merge-train/squash-pr.sh \
    "${PR_NUMBER}" \
    "${PR_HEAD_REF}" \
    "${PR_BASE_REF}" \
    "${PR_BASE_SHA}"

  gh pr edit "${PR_NUMBER}" --remove-label "ci-squash-and-merge"
  gh pr merge "${PR_NUMBER}" --auto -m || true

  echo "Squash and merge completed"
}

handle_benchmarks() {
  if [ "${SHOULD_UPLOAD_BENCHMARKS:-0}" -eq 0 ] || [ "${CI_INTERNAL:-0}" -eq 0 ]; then
    return
  fi

  echo "Downloading benchmarks..."
  ./ci.sh gh-bench
  echo "Benchmarks download complete - upload will be handled by GitHub Action"
}

main() {
  echo_header "CI3 Post-Actions"

  local ci_mode="${CI_MODE:-fast}"
  local github_repository=$(git remote get-url origin | sed -E 's|.*github\.com[/:]([^/]+/[^/]+)(\.git)?$|\1|')

  save_cache "${ci_mode}" "${github_repository}"
  handle_squash_merge "${github_repository}"
  handle_benchmarks

  echo ""
  echo_header "Post-Actions Complete"
}

main
