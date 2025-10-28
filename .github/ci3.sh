#!/usr/bin/env bash
set -euo pipefail

: "${AWS_ACCESS_KEY_ID:?required}"
: "${AWS_SECRET_ACCESS_KEY:?required}"
: "${GITHUB_TOKEN:?required}"

# Source ci3 framework
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

# Labels passed as comma-separated string
labels="${1:-}"

echo_header "CI3 Main Script"
echo "Labels: ${labels}"

echo ""
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
if [ "${GITHUB_EVENT_NAME:-}" == "merge_group" ]; then
  target_branch="${MERGE_GROUP_BASE_REF:-}"
elif [ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]; then
  target_branch="${PR_BASE_REF:-}"
else
  target_branch="${GITHUB_REF_NAME:-}"
fi
target_branch="${target_branch#refs/heads/}"
echo "TARGET_BRANCH=${target_branch}" >> $GITHUB_ENV
echo "Target branch: ${target_branch}"

# Set instance postfix for merge-train PRs
if [[ "${PR_HEAD_REF:-}" == merge-train/* ]]; then
  echo "INSTANCE_POSTFIX=${PR_COMMITS:-}" >> $GITHUB_ENV
  echo "Instance postfix set to: ${PR_COMMITS:-}"
fi

# Setup SSH key (internal only)
if [ "${CI_INTERNAL:-0}" -eq 1 ] && [ -n "${BUILD_INSTANCE_SSH_KEY:-}" ]; then
  mkdir -p ~/.ssh
  echo "${BUILD_INSTANCE_SSH_KEY}" | base64 --decode > ~/.ssh/build_instance_key
  chmod 600 ~/.ssh/build_instance_key
  echo "SSH key configured"
fi

echo ""
echo_header "Label Processing"

# Parse labels into array
IFS=',' read -ra label_array <<< "${labels}"

for label in "${label_array[@]}"; do
  case "${label}" in
    ci-merge-queue)
      echo "Label 'ci-merge-queue' found"
      ci_merge_queue=1
      ;;
    ci-full)
      echo "Label 'ci-full' found"
      ci_full=1
      ;;
    ci-no-cache)
      echo "Label 'ci-no-cache' found"
      ci_no_cache=1
      ;;
    ci-no-fail-fast)
      echo "Label 'ci-no-fail-fast' found"
      ci_no_fail_fast=1
      ;;
    ci-docs)
      echo "Label 'ci-docs' found"
      ci_docs=1
      ;;
    ci-barretenberg)
      echo "Label 'ci-barretenberg' found"
      ci_barretenberg=1
      ;;
  esac
done

echo ""
echo_header "CI Mode Determination"

# Determine CI mode
if [ "${GITHUB_EVENT_NAME:-}" == "merge_group" ] || [ "${ci_merge_queue:-0}" -eq 1 ]; then
  ci_mode="merge-queue"
elif [ "${ci_full:-0}" -eq 1 ]; then
  ci_mode="full"
elif [ "${ci_docs:-0}" -eq 1 ]; then
  ci_mode="docs"
elif [ "${ci_barretenberg:-0}" -eq 1 ]; then
  ci_mode="barretenberg"
elif [[ "${GITHUB_REF:-}" == *"-nightly."* ]] || [[ "${GITHUB_REF:-}" == *"-rc."* ]]; then
  ci_mode="nightly"
elif [[ "${GITHUB_REF:-}" == refs/tags/v* ]]; then
  ci_mode="release"
else
  ci_mode="fast"
fi

echo "CI mode: ${ci_mode}"

# Export CI_MODE for post-action script
echo "CI_MODE=${ci_mode}" >> $GITHUB_ENV

echo ""
echo_header "Cache Check"

# Check cache (unless disabled)
cache_name="ci-success-${ci_mode}.tar.gz"
if [ "${ci_no_cache:-0}" -eq 0 ]; then
  if cache_download "$cache_name" . 2>/dev/null; then
    if [ -f ".ci-success.txt" ]; then
      echo "Cache hit! Previous run: $(cat ".ci-success.txt")"
      exit 0
    fi
  fi
fi

echo "Cache miss, running CI in ${ci_mode} mode..."

echo ""
echo_header "Run CI"

# Run CI
exec ./ci.sh "${ci_mode}"
