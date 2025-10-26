#!/usr/bin/env bash
set -euo pipefail

# CI3 Main Execution Script
# This script encapsulates the common CI logic between ci3.yml and ci3-external.yml
#
# Expected environment variables:
#   CI_INTERNAL: "1" for internal runs, "0" for external runs (default: 0)
#
# For CI mode computation:
#   CI_MERGE_QUEUE: "1" if merge queue override
#   CI_FULL: "1" if full CI override
#   CI_DOCS: "1" if docs CI override (internal only)
#   CI_BARRETENBERG: "1" if barretenberg CI override (internal only)
#   GITHUB_EVENT_NAME: GitHub event name (internal only)
#   GITHUB_REF: GitHub ref (internal only)
#
# For internal runs only (CI_INTERNAL=1):
#   GCP_SA_KEY: GCP service account key
#   GOOGLE_APPLICATION_CREDENTIALS: path to GCP credentials file
#
# For external runs only (CI_INTERNAL=0):
#   REF_NAME: reference name (repo-fork/...)
#   ARCH: architecture (amd64)

: "${CI_INTERNAL:=0}"

echo "=== CI3 Main Script ==="
echo "CI_INTERNAL: ${CI_INTERNAL}"

# Store GCP credentials for internal runs
if [ "${CI_INTERNAL}" -eq 1 ] && [ -n "${GCP_SA_KEY:-}" ]; then
  echo "Setting up GCP credentials (internal run)"
  set +x
  umask 077
  printf '%s' "$GCP_SA_KEY" > "$GOOGLE_APPLICATION_CREDENTIALS"
  jq -e . "$GOOGLE_APPLICATION_CREDENTIALS" >/dev/null
  set -x
fi

# Compute CI mode
if [ "${CI_INTERNAL}" -eq 1 ]; then
  # Internal runs: support all modes
  if [ "${GITHUB_EVENT_NAME:-}" == "merge_group" ] || [ "${CI_MERGE_QUEUE:-0}" -eq 1 ]; then
    ci_mode="merge-queue"
  elif [ "${CI_FULL:-0}" -eq 1 ]; then
    ci_mode="full"
  elif [ "${CI_DOCS:-0}" -eq 1 ]; then
    ci_mode="docs"
  elif [ "${CI_BARRETENBERG:-0}" -eq 1 ]; then
    ci_mode="barretenberg"
  elif [[ "${GITHUB_REF:-}" == *"-nightly."* ]] || [[ "${GITHUB_REF:-}" == *"-rc."* ]]; then
    ci_mode="nightly"
  elif [[ "${GITHUB_REF:-}" == refs/tags/v* ]]; then
    ci_mode="release"
  else
    ci_mode="fast"
  fi
else
  # External runs: only fast, full, or merge-queue
  if [ "${CI_MERGE_QUEUE:-0}" -eq 1 ]; then
    ci_mode="merge-queue"
  elif [ "${CI_FULL:-0}" -eq 1 ]; then
    ci_mode="full"
  else
    ci_mode="fast"
  fi
fi

echo "CI_MODE: ${ci_mode}"

# Run CI based on mode
case "${ci_mode}" in
  merge-queue)
    exec ./ci.sh merge-queue
    ;;
  full)
    exec ./ci.sh full
    ;;
  docs)
    exec ./ci.sh docs
    ;;
  barretenberg)
    exec ./ci.sh barretenberg
    ;;
  nightly)
    exec ./ci.sh nightly
    ;;
  release)
    exec ./ci.sh release
    ;;
  fast)
    exec ./ci.sh fast
    ;;
  *)
    echo "Error: Unknown CI mode: ${ci_mode}"
    exit 1
    ;;
esac
