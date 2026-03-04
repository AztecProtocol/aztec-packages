#!/usr/bin/env bash
# CI3 post-success handler.
# 1. Saves the CI success cache marker.
# 2. Runs all post-job scripts from .github/ci3_post_jobs/.
#
# Post-jobs are executable scripts in .github/ci3_post_jobs/.
# Each script is self-contained: it checks its own conditions (env vars)
# and exits 0 if it should not run. Scripts run in alphabetical order.
set -euo pipefail

NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

function save_cache {
  # CI_CACHE_NAME is set by ci3.sh with tree hash included
  local cache_name="${CI_CACHE_NAME:-}"
  if [ -z "$cache_name" ]; then
    echo "CI_CACHE_NAME not set, skipping cache upload"
    return
  fi
  # Save CI success marker for cache
  local github_repository=$(git remote get-url origin | sed -E 's|.*github\.com[/:]([^/]+/[^/]+)(\.git)?$|\1|')
  local run_url="https://github.com/${github_repository}/actions/runs/${GITHUB_RUN_ID}"
  echo "${run_url}" > ".ci-success.txt"
  echo "Saved CI success marker: ${run_url}"
  # Upload cache
  cache_upload "$cache_name" ".ci-success.txt" 2>&1 | grep -v "^$" || true
}

function run_post_jobs {
  local script_dir
  script_dir="$(git rev-parse --show-toplevel)/.github/ci3_post_jobs"
  if [ ! -d "$script_dir" ]; then
    echo "No post-jobs directory found"
    return
  fi
  local scripts=("$script_dir"/*.sh)
  if [ ! -e "${scripts[0]}" ]; then
    echo "No post-job scripts found"
    return
  fi
  for script in "${scripts[@]}"; do
    local name
    name=$(basename "$script" .sh)
    echo_header "Post-Job: $name"
    if ! bash "$script"; then
      echo "Post-job '$name' failed (non-fatal)"
    fi
  done
}

function main {
  echo_header "CI3 Post-Actions"
  save_cache
  run_post_jobs
  echo_header "Post-Actions Complete"
}

main
