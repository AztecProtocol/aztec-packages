#!/usr/bin/env bash
set -euo pipefail

: "${AWS_ACCESS_KEY_ID:?required}"
: "${AWS_SECRET_ACCESS_KEY:?required}"
: "${GITHUB_TOKEN:?required}"

# Labels passed as comma-separated string
labels="${1:-}"

echo "=== CI3 Main Script ==="
echo "Labels: ${labels}"

# Parse labels into array
IFS=',' read -ra label_array <<< "${labels}"

# Check label overrides (print explicitly)
ci_merge_queue=0
ci_full=0
ci_no_cache=0
ci_no_fail_fast=0
ci_docs=0
ci_barretenberg=0

for label in "${label_array[@]}"; do
  case "${label}" in
    ci-merge-queue)
      echo "Label 'ci-merge-queue' found: enabling merge queue mode"
      ci_merge_queue=1
      ;;
    ci-full)
      echo "Label 'ci-full' found: enabling full CI"
      ci_full=1
      ;;
    ci-no-cache)
      echo "Label 'ci-no-cache' found: disabling cache"
      ci_no_cache=1
      ;;
    ci-no-fail-fast)
      echo "Label 'ci-no-fail-fast' found: disabling fail-fast"
      ci_no_fail_fast=1
      ;;
    ci-docs)
      echo "Label 'ci-docs' found: enabling docs CI"
      ci_docs=1
      ;;
    barretenberg-ci)
      echo "Label 'barretenberg-ci' found: enabling barretenberg CI"
      ci_barretenberg=1
      ;;
  esac
done

# Export for child processes
export CI_MERGE_QUEUE=$ci_merge_queue
export CI_FULL=$ci_full
export NO_CACHE=$ci_no_cache
export NO_FAIL_FAST=$ci_no_fail_fast
export CI_DOCS=$ci_docs
export CI_BARRETENBERG=$ci_barretenberg

# Determine CI mode
if [ "${GITHUB_EVENT_NAME:-}" == "merge_group" ] || [ "$ci_merge_queue" -eq 1 ]; then
  ci_mode="merge-queue"
elif [ "$ci_full" -eq 1 ]; then
  ci_mode="full"
elif [ "$ci_docs" -eq 1 ]; then
  ci_mode="docs"
elif [ "$ci_barretenberg" -eq 1 ]; then
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

# Check cache (unless disabled)
cache_file=".ci-cache/ci-success-${ci_mode}.txt"
if [ "$ci_no_cache" -eq 0 ] && [ -f "$cache_file" ]; then
  echo "Cache hit! Previous run: $(cat "$cache_file")"
  exit 0
fi

echo "Cache miss, running CI in ${ci_mode} mode..."

# Run CI
exec ./ci.sh "${ci_mode}"
