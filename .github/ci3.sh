#!/usr/bin/env bash
# Main CI3 entry point. Sets up the environment and forwards to ci.sh.
# CI mode is passed as first argument.
set -euo pipefail

: "${AWS_ACCESS_KEY_ID:?required}"
: "${AWS_SECRET_ACCESS_KEY:?required}"
: "${GITHUB_TOKEN:?required}"

CI_MODE="${1:?CI_MODE must be provided as first argument}"
shift

NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

function setup_environment {
  echo_header "Setup"
  # Store GCP key
  if [ -n "${GCP_SA_KEY:-}" ]; then
    export GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp-key.json
    set +x
    umask 077
    printf '%s' "$GCP_SA_KEY" > "$GOOGLE_APPLICATION_CREDENTIALS"
    jq -e . "$GOOGLE_APPLICATION_CREDENTIALS" >/dev/null
    echo "GCP key stored"
  fi
  # To allow full concurrency, we set instance postfix for merge-train PRs
  if [[ "${PR_HEAD_REF:-}" == merge-train/* ]]; then
    export INSTANCE_POSTFIX=${PR_COMMITS:-}
    echo "INSTANCE_POSTFIX=$INSTANCE_POSTFIX" >> $GITHUB_ENV
    echo "Instance postfix set to: $INSTANCE_POSTFIX"
  fi
  # Setup SSH key for connecting to EC2 instances
  # Note: The key is used to SSH into instances but is only copied INTO instances when CI_USE_BUILD_INSTANCE_KEY=1 (internal CI only)
  if [ -n "${BUILD_INSTANCE_SSH_KEY:-}" ]; then
    mkdir -p ~/.ssh
    echo "${BUILD_INSTANCE_SSH_KEY}" | base64 --decode > ~/.ssh/build_instance_key
    chmod 600 ~/.ssh/build_instance_key
    echo "SSH key configured"
  fi
}

function check_cache {
  echo_header "Cache Check"
  local tree_hash=$(git rev-parse HEAD^{tree})
  local cache_name="ci-success-${CI_MODE}-${tree_hash}.tar.gz"
  # Export for use by ci3_success.sh
  echo "CI_CACHE_NAME=$cache_name" >> $GITHUB_ENV
  # Only whitelist some ci modes for cache.
  # E.g. we skip cache for release builds - they must always produce versioned images
  cached_ci_modes=(
    "fast"
    "full"
    "full-no-test-cache"
    "docs"
    "barretenberg"
    "ci-release-pr"
  )
  # Check if CI_MODE is in cached_ci_modes
  if [[ " ${cached_ci_modes[@]} " =~ " ${CI_MODE} " ]]; then
    if cache_download "$cache_name" . 2>/dev/null && [ -f ".ci-success.txt" ]; then
      echo "Cache hit in .github/ci3.sh! Previous run: $(cat ".ci-success.txt")"
      exit 0
    fi
    echo "Cache miss in .github/ci3.sh, running CI in ${CI_MODE} mode..."
  else
    echo "Not using the .github/ci3.sh CI cache for mode $CI_MODE."
  fi
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
  echo_header "CI3 Main Script"
  echo "CI mode: $CI_MODE"
  setup_environment
  # Handle release-pr mode separately (creates tag instead of running CI)

  if [ "${CI_MODE}" == "skip" ]; then
    echo_stderr "WARNING: CI is being skipped in this PR."
    exit 0
  fi
  if [ "${CI_MODE}" == "release-pr" ]; then
    handle_release_pr
    exit 0
  fi
  check_cache
  echo_header "Run ${CI_MODE} CI"
  exec ./ci.sh "${CI_MODE}" "$@"
}

main "$@"
