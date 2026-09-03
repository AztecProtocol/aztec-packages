#!/usr/bin/env bash
# Determines CI mode from labels and environment variables.
# Called by ci3.yml and ci3-external.yml to set CI_MODE and related environment variables.
# Outputs environment variables to GITHUB_ENV for use in subsequent steps.
set -euo pipefail

function has_label {
  local label="$1"
  for l in "${LABELS[@]}"; do
    if [[ "$l" == "$label" ]]; then
      return 0
    fi
  done
  return 1
}

function join_by {
  local delimiter="$1"
  shift
  local result=""
  local value
  for value in "$@"; do
    if [[ -n "$result" ]]; then
      result+="$delimiter"
    fi
    result+="$value"
  done
  echo "$result"
}

function head_commit_has_marker {
  local marker="$1"
  local message
  message="$(git log -1 --pretty=%B 2>/dev/null || true)"
  grep -Eq "(^|[[:space:]])${marker}([[:space:]]|$)" <<< "$message"
}

function main {
  LABELS=("$@")
  echo "Labels: ${LABELS[*]}"

  # Compute target branch
  local target_branch
  if [ "${GITHUB_EVENT_NAME:-}" == "merge_group" ]; then
    target_branch="${MERGE_GROUP_BASE_REF:-}"
  elif [ "${GITHUB_EVENT_NAME:-}" == "pull_request" ] || [ "${GITHUB_EVENT_NAME:-}" == "pull_request_target" ]; then
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

  # Handle skip-compat-e2e label (escape hatch for backwards compat test failures on release PRs)
  if has_label "ci-skip-compat-e2e"; then
    echo "SKIP_COMPAT_E2E=1" >> $GITHUB_ENV
  fi

  local chonk_input_update=0
  local chonk_input_update_requested=0
  if [ "${GITHUB_EVENT_NAME:-}" = "pull_request" ] && { has_label "ci-refresh-chonk" || head_commit_has_marker "--ci-refresh-chonk"; }; then
    chonk_input_update_requested=1
  fi
  local ci_skip_requested=0
  if has_label "ci-skip" || head_commit_has_marker "--ci-skip"; then
    ci_skip_requested=1
  fi

  local explicit_ci_mode_labels=()
  local mode_label
  for mode_label in ci-merge-queue ci-release-pr ci-full ci-full-no-test-cache ci-barretenberg-full ci-barretenberg; do
    if has_label "$mode_label"; then
      explicit_ci_mode_labels+=("$mode_label")
    fi
  done

  if [ "$ci_skip_requested" -eq 0 ] && [ "${#explicit_ci_mode_labels[@]}" -gt 1 ]; then
    echo "ERROR: Conflicting CI mode labels: $(join_by ', ' "${explicit_ci_mode_labels[@]}"). Remove all but one mode label, or use ci-skip/--ci-skip to skip CI intentionally." >&2
    exit 1
  fi

  if [ "$ci_skip_requested" -eq 0 ] && [ "$chonk_input_update_requested" -eq 1 ] && [ "${#explicit_ci_mode_labels[@]}" -gt 0 ]; then
    echo "ERROR: ci-refresh-chonk cannot be combined with explicit CI mode labels: $(join_by ', ' "${explicit_ci_mode_labels[@]}"). Remove the mode label, or use ci-skip/--ci-skip to skip without refreshing inputs." >&2
    exit 1
  fi

  # Chonk input updates are side-effecting internal PR-only work. The main CI
  # run behaves like ci-skip until post-actions regenerate and push the diff.
  if [ "$chonk_input_update_requested" -eq 1 ] && [ "$ci_skip_requested" -eq 0 ]; then
    chonk_input_update=1
  fi
  echo "CHONK_INPUT_UPDATE_REQUESTED=$chonk_input_update" >> $GITHUB_ENV

  # Determine CI mode based on event, labels, and target branch
  local ci_mode
  if [ "$ci_skip_requested" -eq 1 ]; then
    echo "WARNING: Skipping CI because a ci-skip label or --ci-skip commit marker was present. Skip takes precedence over other CI signals." >&2
    if [ "$chonk_input_update_requested" -eq 1 ]; then
      echo "WARNING: Chonk input refresh was requested but ignored because CI skip was also requested." >&2
    fi
    ci_mode="skip"
  elif [ "${GITHUB_EVENT_NAME:-}" == "merge_group" ] || has_label "ci-merge-queue"; then
    ci_mode="merge-queue"
    # Check if this is a spartan merge-train PR entering the merge queue.
    # If so, use the heavier merge-queue-heavy mode (10 grind runs).
    if [ "${GITHUB_EVENT_NAME:-}" == "merge_group" ] && [ -n "${GITHUB_TOKEN:-}" ]; then
      # GITHUB_REF_NAME in merge_group is like: gh-readonly-queue/next/pr-XXX-SHA
      local pr_number
      pr_number=$(echo "${GITHUB_REF_NAME:-}" | sed -n 's|gh-readonly-queue/.*/pr-\([0-9]*\)-.*|\1|p')
      if [ -n "$pr_number" ]; then
        local head_branch
        head_branch=$(GH_TOKEN="$GITHUB_TOKEN" gh pr view "$pr_number" --json headRefName -q '.headRefName' 2>/dev/null || true)
        if [ "$head_branch" == "merge-train/spartan-v5" ]; then
          ci_mode="merge-queue-heavy"
        elif [ "$head_branch" == "merge-train/ci" ]; then
          ci_mode="merge-queue-ci"
        fi
      fi
    fi
  elif [ "$chonk_input_update" -eq 1 ]; then
    echo "WARNING: Skipping main CI because Chonk input refresh was requested; the update step will run after this step succeeds." >&2
    ci_mode="skip"
  elif has_label "ci-release-pr"; then
    # Release-PR mode creates and pushes a release tag for this PR's head (ci3.sh::handle_release_pr).
    # In the private repo that tag triggers a private release via the safety gate below. It is the only
    # way a private release is cut: there are no private nightlies (nightly-release-tag.yml runs in the
    # public repo alone, by design).
    ci_mode="release-pr"
  elif has_label "ci-full"; then
    ci_mode="full"
  elif has_label "ci-full-no-test-cache"; then
    ci_mode="full-no-test-cache"
  # elif has_label "ci-test-network"; then
  #   ci_mode="full-no-test-cache"
  elif has_label "ci-barretenberg-full"; then
    ci_mode="barretenberg-full"
  elif has_label "ci-barretenberg" || [ "$target_branch" == "merge-train/barretenberg" ]; then
    ci_mode="barretenberg"
  elif [[ "${GITHUB_REF:-}" == refs/tags/v* ]]; then
    # A pushed semver tag is a release; REF_NAME is the tag (see ci3/source_refname). In the public repo
    # nightly-release-tag.yml pushes v<ver>-nightly.<date> tags on next and v5-next; in the private repo
    # the only tags are the ones ci-release-pr creates, and the safety gate below routes them to the
    # internal Artifact Registry.
    ci_mode="release"
  else
    ci_mode="fast"
  fi

  echo "CI_MODE=$ci_mode" >> $GITHUB_ENV
  echo "CI mode: $ci_mode"

  # Private-repo safety gate. The release flow can publish to DockerHub/npmjs/crates.io/github; that
  # MUST NEVER run in the private fork. So whenever this repo would release — for ANY trigger (a pushed
  # nightly tag, a ci-release-pr tag, anything future) — force the private path: publish only the docker
  # image and npm packages to our internal Artifact Registry (bootstrap.sh::private_release). Keyed on
  # the repo name (case-insensitive) so it can't be reached in the public repo.
  if [ "$ci_mode" = "release" ] &&
     [ "$(printf '%s' "${GITHUB_REPOSITORY:-}" | tr 'A-Z' 'a-z')" = "aztecprotocol/aztec-packages-private" ]; then
    echo "PRIVATE_RELEASE=1" >> $GITHUB_ENV
    echo "SKIP_COMPAT_E2E=1" >> $GITHUB_ENV
  fi

  # Benching modes run their benches on a dedicated, fixed-hardware box (stable numbers)
  # and publish the result; ci-fast never benches. For grind runs (merge-queue-heavy fires
  # ~10 instances) only the first instance keeps BENCH_UPLOAD=1 — multi_job_run forces the
  # rest to 0 so they bench inline as a breakage check without racing the upload. The
  # destination (bench/next vs bench/prs) is BENCH_BRANCH below.
  if [[ "$ci_mode" == "merge-queue" || "$ci_mode" == "merge-queue-heavy" || "$ci_mode" == "full" || "$ci_mode" == "full-no-test-cache" ]]; then
    echo "BENCH_UPLOAD=1" >> $GITHUB_ENV
  fi

  # Determine the branch label for benchmark publishing.
  # Only merge-queue runs targeting "next" publish under "next" since those represent code about to land.
  # Everything else (ci-full PRs, merge queues for other branches) publishes under "prs"
  # to avoid polluting the main benchmark graphs.
  local bench_branch
  if [[ ("$ci_mode" == "merge-queue" || "$ci_mode" == "merge-queue-heavy") && "$target_branch" == "next" ]]; then
    bench_branch="$target_branch"
  else
    bench_branch="prs"
  fi
  echo "BENCH_BRANCH=$bench_branch" >> $GITHUB_ENV
  echo "Bench branch: $bench_branch"

  # Handle no-cache label
  if has_label "no-cache"; then
    echo "NO_CACHE=1" >> $GITHUB_ENV
    echo "Cache disabled by label"
  fi
}

main "$@"
