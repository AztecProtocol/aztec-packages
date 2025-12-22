#!/usr/bin/env bash
set -euo pipefail

: "${AWS_ACCESS_KEY_ID:?required}"
: "${AWS_SECRET_ACCESS_KEY:?required}"
: "${GITHUB_TOKEN:?required}"

NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

function setup_environment {
  echo_header "Setup"
  # Store GCP key
  if [ -n "${GCP_SA_KEY:-}" ] && [ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then
    set +x
    umask 077
    printf '%s' "$GCP_SA_KEY" > "$GOOGLE_APPLICATION_CREDENTIALS"
    jq -e . "$GOOGLE_APPLICATION_CREDENTIALS" >/dev/null
    echo "GCP key stored"
  fi
  # Compute target branch
  local target_branch
  if [ "${GITHUB_EVENT_NAME:-}" == "merge_group" ]; then
    target_branch="${MERGE_GROUP_BASE_REF:-}"
  elif [ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]; then
    target_branch="${PR_BASE_REF:-}"
  else
    target_branch="${GITHUB_REF_NAME:-}"
  fi
  target_branch="${target_branch#refs/heads/}"
  export TARGET_BRANCH=$target_branch
  echo "TARGET_BRANCH=$TARGET_BRANCH" >> $GITHUB_ENV
  echo "Target branch: $TARGET_BRANCH"
  # To allow full concurrency, we set instance postfix for merge-train PRs
  if [[ "${PR_HEAD_REF:-}" == merge-train/* ]]; then
    export INSTANCE_POSTFIX=${PR_COMMITS:-}
    echo "INSTANCE_POSTFIX=$INSTANCE_POSTFIX" >> $GITHUB_ENV
    echo "Instance postfix set to: $INSTANCE_POSTFIX"
  fi
  # Setup SSH key for connecting to EC2 instances
  # Note: The key is used to SSH into instances but is only copied INTO instances when CI_ENABLE_DISK_LOGS=1 (internal CI only)
  if [ -n "${BUILD_INSTANCE_SSH_KEY:-}" ]; then
    mkdir -p ~/.ssh
    echo "${BUILD_INSTANCE_SSH_KEY}" | base64 --decode > ~/.ssh/build_instance_key
    chmod 600 ~/.ssh/build_instance_key
    echo "SSH key configured"
  fi
}

function has_label {
  local label="$1"
  if [[ ",$LABELS," == *",$label,"* ]]; then
    echo "Label '$label' found" >&2
    return 0
  fi
  return 1
}

function determine_ci_mode {
  echo_header "CI Mode Determination"
  echo "Labels: ${LABELS}"
  # Handle fail-fast override
  if has_label "ci-no-fail-fast"; then
    export NO_FAIL_FAST=1
    echo "NO_FAIL_FAST=$NO_FAIL_FAST" >> $GITHUB_ENV
  fi
  # Determine CI mode based on event, labels, and target branch
  if [ "${GITHUB_EVENT_NAME:-}" == "merge_group" ] || has_label "ci-merge-queue"; then
    CI_MODE="merge-queue"
  elif has_label "ci-release-pr"; then
    CI_MODE="release-pr"
  elif has_label "ci-full"; then
    CI_MODE="full"
  elif has_label "ci-full-no-test-cache"; then
    CI_MODE="full-no-test-cache"
  elif has_label "ci-docs" || [ "${TARGET_BRANCH:-}" == "merge-train/docs" ]; then
    CI_MODE="docs"
  elif has_label "ci-barretenberg" || [ "${TARGET_BRANCH:-}" == "merge-train/barretenberg" ]; then
    CI_MODE="barretenberg"
  elif has_label "ci-barretenberg-full"; then
    CI_MODE="barretenberg-full"
  # We don't distinguish nightlies currently.
  # elif [[ "${GITHUB_REF:-}" == *"-nightly."* ]] || [[ "${GITHUB_REF:-}" == *"-rc."* ]]; then
  #   CI_MODE="nightly"
  elif [[ "${GITHUB_REF:-}" == refs/tags/v* ]]; then
    CI_MODE="release"
  else
    CI_MODE="fast"
  fi
  echo "CI_MODE=$CI_MODE" >> $GITHUB_ENV
  echo "CI mode: $CI_MODE"
  # Determine if benchmarks should be uploaded (merge-queue, full, or full-no-test-cache modes)
  if [[ "$CI_MODE" == "merge-queue" || "$CI_MODE" == "full" || "$CI_MODE" == "full-no-test-cache" ]]; then
    echo "SHOULD_UPLOAD_BENCHMARKS=1" >> $GITHUB_ENV
  fi
}

function check_cache {
  echo_header "Cache Check"
  local tree_hash=$(git rev-parse HEAD^{tree})
  local cache_name="ci-success-${CI_MODE}-${tree_hash}.tar.gz"
  # Export for use by ci3-post.sh
  echo "CI_CACHE_NAME=$cache_name" >> $GITHUB_ENV
  # Skip cache for release builds - they must always produce versioned images
  if [ "$CI_MODE" == "release" ]; then
    echo "Cache disabled for release builds"
    return
  fi
  if has_label "no-cache"; then
    export NO_CACHE=1
    echo "NO_CACHE=$NO_CACHE" >> $GITHUB_ENV
    echo "Cache disabled by label"
    return
  fi
  if cache_download "$cache_name" . 2>/dev/null && [ -f ".ci-success.txt" ]; then
    echo "Cache hit! Previous run: $(cat ".ci-success.txt")"
    exit 0
  fi
  echo "Cache miss, running CI in ${CI_MODE} mode..."
}

function handle_release_pr {
  echo_header "Release PR"
  # Create and push a tag for release PR testing
  local github_repository
  github_repository=$(git remote get-url origin | sed -E 's|.*github\.com[/:]([^/]+/[^/]+)(\.git)?$|\1|')
  git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${github_repository}"
  local tag_name="v0.0.1-commit.$(git rev-parse --short HEAD)"
  git tag "${tag_name}"
  git push origin "${tag_name}"
  echo "Created and pushed tag: ${tag_name}"
}

function main {
  LABELS="${1:-}"
  echo_header "CI3 Main Script"
  setup_environment
  determine_ci_mode
  # Handle release-pr mode separately (creates tag instead of running CI)
  if [ "${CI_MODE}" == "release-pr" ]; then
    handle_release_pr
    exit 0
  fi
  check_cache
  echo_header "Run ${CI_MODE} CI"
  exec ./ci.sh "${CI_MODE}"
}

main "$@"
