#!/usr/bin/env bash
# Main CI3 entry point. Sets up the environment and forwards to ci.sh.
# CI mode is passed as first argument.
set -euo pipefail

# AWS credentials are handled by instance profiles on all paths.
: "${GITHUB_TOKEN:?required}"

CI_MODE="${1:?CI_MODE must be provided as first argument}"
shift

NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source_base

function setup_environment {
  echo_header "Setup"
  # Store GCP key
  if [ -n "${GCP_PRIVATE_NPM_DEPLOY_KEY:-}" ]; then
    export GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp-key.json
    set +x
    umask 077
    printf '%s' "$GCP_PRIVATE_NPM_DEPLOY_KEY" > "$GOOGLE_APPLICATION_CREDENTIALS"
    jq -e . "$GOOGLE_APPLICATION_CREDENTIALS" >/dev/null
    echo "GCP key stored"
  fi
  # To allow full concurrency, we set instance postfix for merge-train PRs
  if [[ "${PR_HEAD_REF:-}" == merge-train/* ]]; then
    export INSTANCE_POSTFIX=${PR_COMMITS:-}
    echo "INSTANCE_POSTFIX=$INSTANCE_POSTFIX" >> $GITHUB_ENV
    echo "Instance postfix set to: $INSTANCE_POSTFIX"
  fi
  # The SSH key is written only for the direct-SSH bootstrap path (CI_USE_SSH=1, set from
  # the CI_USE_SSH repo variable as an escape hatch if SSM breaks). SSM mode authenticates
  # to the build instance with an instance profile and needs no SSH credential at all, so
  # the key is left unwritten: with no ~/.ssh/build_instance_key on the runner, source_redis
  # cannot reach for the bastion tunnel, and a run cannot come to depend on that secret.
  if [ "${CI_USE_SSH:-0}" -eq 1 ]; then
    : "${BUILD_INSTANCE_SSH_KEY:?CI_USE_SSH=1 needs BUILD_INSTANCE_SSH_KEY}"
    mkdir -p ~/.ssh
    echo "${BUILD_INSTANCE_SSH_KEY}" | base64 --decode > ~/.ssh/build_instance_key
    chmod 600 ~/.ssh/build_instance_key
    echo "SSH mode: key configured"
  else
    # Defaults are baked into aws_request_instance_type.
    echo "SSM mode: instance profile ${CI3_INSTANCE_PROFILE_NAME:-ci3-build-instance-profile}, SG ${CI3_SECURITY_GROUP_ID:-sg-01fe61a1c1aaeb393}"
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
    "barretenberg"
    "ci-release-pr"
  )
  # Check if CI_MODE is in cached_ci_modes
  if [[ " ${cached_ci_modes[@]} " =~ " ${CI_MODE} " && "$GITHUB_RUN_ATTEMPT" -eq 1 ]]; then
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
  git config --unset-all http.https://github.com/.extraheader || true
  git tag "${tag_name}"
  git push origin "${tag_name}"
  echo "Created and pushed tag: ${tag_name}"
  # REST, not `gh pr edit`: that starts with a GraphQL viewer query the bot token cannot make
  # (needs read:org), so the label silently stayed and every later push re-ran the release.
  gh api -X DELETE "repos/${github_repository}/issues/${PR_NUMBER}/labels/ci-release-pr" >/dev/null || true
}

function main {
  echo_header "CI3 Main Script"
  echo "CI mode: $CI_MODE"
  setup_environment
  # Handle release-pr mode separately (creates tag instead of running CI)

  if [ "${CI_MODE}" == "skip" ]; then
    echo "WARNING: CI is being skipped in this PR." >&2
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
