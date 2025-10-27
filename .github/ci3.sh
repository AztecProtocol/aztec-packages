#!/usr/bin/env bash
set -euo pipefail

# CI3 Main Execution Script
# This script encapsulates the common CI logic between ci3.yml and ci3-external.yml
#
# Usage: ci3.sh <ci-mode>
#   where <ci-mode> is one of: fast, full, merge-queue, docs, barretenberg, nightly, release
#
# Expected environment variables:
#   CI_INTERNAL: "1" for internal runs, "0" for external runs (default: 0)
#
# For internal runs only (CI_INTERNAL=1):
#   GCP_SA_KEY: GCP service account key
#   GOOGLE_APPLICATION_CREDENTIALS: path to GCP credentials file
#
# For external runs only (CI_INTERNAL=0):
#   REF_NAME: reference name (repo-fork/...)
#   ARCH: architecture (amd64)

: "${CI_INTERNAL:=0}"

if [ $# -ne 1 ]; then
  echo "Error: CI mode argument required"
  echo "Usage: $0 <ci-mode>"
  echo "  where <ci-mode> is one of: fast, full, merge-queue, docs, barretenberg, nightly, release"
  exit 1
fi

ci_mode="$1"

echo "=== CI3 Main Script ==="
echo "CI_INTERNAL: ${CI_INTERNAL}"
echo "CI_MODE: ${ci_mode}"

# Store GCP credentials for internal runs
if [ "${CI_INTERNAL}" -eq 1 ] && [ -n "${GCP_SA_KEY:-}" ]; then
  echo "Setting up GCP credentials (internal run)"
  set +x
  umask 077
  printf '%s' "$GCP_SA_KEY" > "$GOOGLE_APPLICATION_CREDENTIALS"
  jq -e . "$GOOGLE_APPLICATION_CREDENTIALS" >/dev/null
  set -x
fi

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
