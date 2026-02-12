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
    # Check if this is a merge-train/spartan PR entering the merge queue.
    # If so, use the heavier merge-queue-heavy mode (10 grind runs).
    if [ "${GITHUB_EVENT_NAME:-}" == "merge_group" ] && [ -n "${GITHUB_TOKEN:-}" ]; then
      # GITHUB_REF_NAME in merge_group is like: gh-readonly-queue/next/pr-XXX-SHA
      local pr_number
      pr_number=$(echo "${GITHUB_REF_NAME:-}" | sed -n 's|gh-readonly-queue/.*/pr-\([0-9]*\)-.*|\1|p')
      if [ -n "$pr_number" ]; then
        local head_branch
        head_branch=$(GH_TOKEN="$GITHUB_TOKEN" gh pr view "$pr_number" --json headRefName -q '.headRefName' 2>/dev/null || true)
        if [ "$head_branch" == "merge-train/spartan" ]; then
          echo "Merge-train/spartan PR detected, using merge-queue-heavy mode" >&2
          ci_mode="merge-queue-heavy"
        fi
      fi
    fi
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
  elif has_label "ci-barretenberg-full"; then
    ci_mode="barretenberg-full"
  elif has_label "ci-barretenberg" || [ "$target_branch" == "merge-train/barretenberg" ]; then
    ci_mode="barretenberg"
  elif [[ "${GITHUB_REF:-}" == refs/tags/v* ]]; then
    ci_mode="release"
  elif has_label "ci-skip"; then
    echo "WARNING: Skipping CI due to the ci-skipok label! Make sure this is intended!" >&2
    ci_mode="skip"
  else
    ci_mode="fast"
  fi
  echo "CI_MODE=$ci_mode" >> $GITHUB_ENV
  echo "CI mode: $ci_mode"

  # Determine if benchmarks should be uploaded (merge-queue, full, or full-no-test-cache modes)
  if [[ "$ci_mode" == "merge-queue" || "$ci_mode" == "merge-queue-heavy" || "$ci_mode" == "full" || "$ci_mode" == "full-no-test-cache" ]]; then
    echo "SHOULD_UPLOAD_BENCHMARKS=1" >> $GITHUB_ENV
  fi

  # Handle no-cache label
  if has_label "no-cache"; then
    echo "NO_CACHE=1" >> $GITHUB_ENV
    echo "Cache disabled by label"
  fi
}

main "$@"
