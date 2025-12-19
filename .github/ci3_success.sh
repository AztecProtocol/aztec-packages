#!/usr/bin/env bash
set -euo pipefail

NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

function save_cache {
  local github_repository="$1"
  # CI_CACHE_NAME is set by ci3.sh with tree hash included
  local cache_name="${CI_CACHE_NAME:-}"
  if [ -z "$cache_name" ]; then
    echo "CI_CACHE_NAME not set, skipping cache upload"
    return
  fi
  # Save CI success marker for cache
  local run_url="https://github.com/${github_repository}/actions/runs/${GITHUB_RUN_ID}"
  echo "${run_url}" > ".ci-success.txt"
  echo "Saved CI success marker: ${run_url}"
  # Upload cache
  cache_upload "$cache_name" ".ci-success.txt" 2>&1 | grep -v "^$" || true
}

function handle_squash_merge {
  local github_repository="$1"
  if [ "${SHOULD_SQUASH_MERGE:-0}" -eq 0 ]; then
    return
  fi
  # If we have passed CI and labelled with ci-squash-and-merge, squash the PR.
  # This will rerun CI on the squash commit - but is intended to be a no-op due to caching.
  echo "Processing squash and merge..."
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
}

function handle_benchmarks {
  # Handle benchmarks download (internal only)
  echo "Downloading benchmarks..."
  if ./ci.sh gh-bench && [ -f "./bench-out/bench.json" ] && [ "$(cat ./bench-out/bench.json)" != "[]" ]; then
    echo "Benchmarks downloaded successfully"
    echo "SHOULD_UPLOAD_BENCHMARKS=1" >> $GITHUB_ENV
  else
    echo "No benchmarks to upload"
    echo "SHOULD_UPLOAD_BENCHMARKS=0" >> $GITHUB_ENV
  fi
}

function main {
  echo_header "CI3 Post-Actions"
  # Get repository from git remote
  local github_repository=$(git remote get-url origin | sed -E 's|.*github\.com[/:]([^/]+/[^/]+)(\.git)?$|\1|')
  save_cache "${github_repository}"
  handle_squash_merge "${github_repository}"
  handle_benchmarks
  echo_header "Post-Actions Complete"
}

main
