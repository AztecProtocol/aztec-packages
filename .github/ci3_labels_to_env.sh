#!/usr/bin/env bash
# Determines CI mode from labels and environment variables.
# Called by ci3.yml to set CI_MODE and related environment variables.
# Outputs environment variables to GITHUB_ENV for use in subsequent steps.
set -euo pipefail

function has_label {
  local label="$1"
  for l in "${LABELS[@]}"; do
    if [[ "$l" == "$label" ]]; then
      echo "Label '$label' found" >&2
      return 0
    fi
  done
  return 1
}

function main {
  LABELS=("$@")
  echo "Labels: ${LABELS[*]}"

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
  echo "TARGET_BRANCH=$target_branch" >> $GITHUB_ENV
  echo "Target branch: $target_branch"

  # Handle fail-fast override
  if has_label "ci-no-fail-fast"; then
    echo "NO_FAIL_FAST=1" >> $GITHUB_ENV
  fi

  # Determine CI mode based on event, labels, and target branch
  local ci_mode
  if [ "${GITHUB_EVENT_NAME:-}" == "merge_group" ] || has_label "ci-merge-queue"; then
    ci_mode="merge-queue"
  elif has_label "ci-release-pr"; then
    ci_mode="release-pr"
  elif has_label "ci-full"; then
    ci_mode="full"
  elif has_label "ci-full-no-test-cache"; then
    ci_mode="full-no-test-cache"
  # elif has_label "ci-test-network"; then
  #   ci_mode="full-no-test-cache"
  elif has_label "ci-docs" || [ "$target_branch" == "merge-train/docs" ]; then
    ci_mode="docs"
  elif has_label "ci-barretenberg" || [ "$target_branch" == "merge-train/barretenberg" ]; then
    ci_mode="barretenberg"
  elif [[ "${GITHUB_REF:-}" == refs/tags/v* ]]; then
    ci_mode="release"
  else
    ci_mode="fast"
  fi
  echo "CI_MODE=$ci_mode" >> $GITHUB_ENV
  echo "CI mode: $ci_mode"

  # Determine if benchmarks should be uploaded (merge-queue, full, or full-no-test-cache modes)
  if [[ "$ci_mode" == "merge-queue" || "$ci_mode" == "full" || "$ci_mode" == "full-no-test-cache" ]]; then
    echo "SHOULD_UPLOAD_BENCHMARKS=1" >> $GITHUB_ENV
  fi

  # Handle no-cache label
  if has_label "no-cache"; then
    echo "NO_CACHE=1" >> $GITHUB_ENV
    echo "Cache disabled by label"
  fi
}

main "$@"
