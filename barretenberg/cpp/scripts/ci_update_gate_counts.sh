#!/usr/bin/env bash
# Refresh the pinned barretenberg gate-count fixture and push the diff back.
#
# Mirrors ci_update_chonk_inputs.sh, but for barretenberg/cpp/scripts/gate-counts.json
# (and the generated barretenberg/cpp/src/barretenberg/dsl/acir_format/gate_count_constants.hpp).
#
# Triggered by the PR label `ci-refresh-gates` or by a `--ci-refresh-gates`
# marker in the head commit message. See .github/ci3_labels_to_env.sh and
# .github/ci3_success.sh.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
NO_CD=1 source "$root/ci3/source"

json_file="barretenberg/cpp/scripts/gate-counts.json"
hpp_file="barretenberg/cpp/src/barretenberg/dsl/acir_format/gate_count_constants.hpp"
refresh_label="${BB_GATE_COUNTS_REFRESH_LABEL:-ci-refresh-gates}"
github_token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
github_repository="${GITHUB_REPOSITORY:-AztecProtocol/aztec-packages}"
state_dir="$root/.cache/gate-counts/ci-update"
observed_dir="$state_dir/observed"
diff_file="$state_dir/gate-counts.diff"

function echo_stderr {
  echo "$@" >&2
}

function gh_pr {
  [[ -n "$github_token" ]] || return 1
  GH_TOKEN="$github_token" gh pr "$@"
}

function remove_pr_label {
  local label=${1:?label required}
  [[ -n "${PR_NUMBER:-}" ]] || return 0
  gh_pr edit "$PR_NUMBER" --repo "$github_repository" --remove-label "$label" >/dev/null 2>&1 || true
}

function comment_pr {
  local body=${1:?body required}
  [[ -n "${PR_NUMBER:-}" ]] || return 0
  gh_pr comment "$PR_NUMBER" --repo "$github_repository" --body "$body" >/dev/null 2>&1 || true
}

function write_diff_file {
  mkdir -p "$state_dir"
  : > "$diff_file"
  if ! git diff --cached --quiet; then
    {
      echo "# staged diff"
      git diff --cached --binary
    } >> "$diff_file"
  fi
  if ! git diff --quiet; then
    {
      echo "# unstaged diff"
      git diff --binary
    } >> "$diff_file"
  fi
  if [[ ! -s "$diff_file" ]]; then
    git show --binary --format=fuller --patch HEAD > "$diff_file"
  fi
}

function comment_diff_failure {
  local reason=${1:?reason required}
  comment_pr "Gate-count refresh produced changes, but ${reason}. Reproduce locally with:\n\`\`\`\nBB_GATE_COUNT_OBSERVED_DIR=\$(mktemp -d) barretenberg/cpp/scripts/run_test.sh dsl_tests '*GateCount*'\n\`\`\`\nthen \`barretenberg/cpp/scripts/merge_observed_gate_counts.py \"\$BB_GATE_COUNT_OBSERVED_DIR\"\` and \`barretenberg/cpp/scripts/gen_gate_count_constants.py\`."
}

function ensure_clean_observed_dir {
  rm -rf "$observed_dir"
  mkdir -p "$observed_dir"
}

# Test selectors. Each entry is "<binary>:<gtest_filter>". Keep the filters
# narrow so a refresh round-trip only rebuilds and reruns the gate-count
# pinned tests instead of the whole suite.
GATE_COUNT_TEST_SELECTORS=(
  "dsl_tests:HypernovaRecursionConstraintTest.*KernelGateCount:*HonkRecursionConstraintTestWithoutPredicate*GateCountRootRollup*:*HonkRecursionConstraintTest*GateCountSingleHonkRecursion*:*ChonkRecursionConstraintTest*GateCountChonkRecursion*"
  "stdlib_eccvm_verifier_tests:*"
  "stdlib_honk_verifier_tests:*RecursiveVerifierTest*"
)

function build_and_run_tests {
  ensure_clean_observed_dir
  for selector in "${GATE_COUNT_TEST_SELECTORS[@]}"; do
    local binary="${selector%%:*}"
    local filter="${selector#*:}"
    echo_header "Refreshing via $binary (filter=$filter)"
    BB_GATE_COUNT_OBSERVED_DIR="$observed_dir" \
      barretenberg/cpp/scripts/run_test.sh "$binary" "$filter" \
      || echo_stderr "WARN: $binary exited non-zero. Continuing to merge observed values."
  done
}

function ensure_python {
  if ! command -v python3 >/dev/null 2>&1; then
    echo_stderr "ERROR: python3 is required for gate-count refresh."
    return 1
  fi
}

remove_pr_label "$refresh_label"

ensure_python

build_and_run_tests

if [[ -z "$(find "$observed_dir" -maxdepth 1 -name '*.jsonl' -print -quit 2>/dev/null)" ]]; then
  echo_stderr "ERROR: no observed gate-count records were produced. Verify that test binaries link gate_count_fixture and that BB_GATE_COUNT_OBSERVED_DIR was honored."
  comment_diff_failure "no observed gate counts were recorded"
  exit 1
fi

python3 barretenberg/cpp/scripts/merge_observed_gate_counts.py "$observed_dir"
python3 barretenberg/cpp/scripts/gen_gate_count_constants.py

git add "$json_file" "$hpp_file"

if git diff --cached --quiet; then
  echo "Pinned gate counts are already up to date."
  remove_pr_label "$refresh_label"
  exit 0
fi

if [[ -z "${PR_NUMBER:-}" || -z "${PR_HEAD_REF:-}" ]]; then
  git diff --cached --stat
  echo_stderr "ERROR: gate-count refresh would change files, but this run is not attached to a PR head branch."
  exit 1
fi

pr_info="$(GH_TOKEN="$github_token" gh pr view "$PR_NUMBER" --repo "$github_repository" --json headRefName,isCrossRepository)"
head_ref="$(jq -r '.headRefName' <<< "$pr_info")"
is_fork="$(jq -r '.isCrossRepository' <<< "$pr_info")"

if [[ "$is_fork" == "true" ]]; then
  comment_diff_failure "push-back is unavailable for fork PRs"
  remove_pr_label "$refresh_label"
  exit 1
fi

if [[ "$head_ref" != "$PR_HEAD_REF" ]]; then
  comment_diff_failure "the PR head branch changed from ${PR_HEAD_REF} to ${head_ref}"
  remove_pr_label "$refresh_label"
  exit 1
fi

git config user.name "AztecBot"
git config user.email "tech@aztecprotocol.com"
git remote set-url origin "https://x-access-token:${github_token}@github.com/${github_repository}.git"
git config --unset-all http.https://github.com/.extraheader || true

write_diff_file
git commit -m "chore(bb): refresh pinned gate counts" \
  -m "Generated by ci-refresh-gates." \
  -m "Updates barretenberg/cpp/scripts/gate-counts.json and the regenerated gate_count_constants.hpp from observed test runs." \
  -m "--ci-skip" \
  --no-verify

if git push origin "HEAD:refs/heads/${PR_HEAD_REF}"; then
  echo "Pushed gate-count refresh to ${PR_HEAD_REF}."
  comment_pr "Pinned barretenberg gate counts refreshed. The update commit includes a head-commit \`--ci-skip\` marker so the automatic follow-up run does not repeat CI."
  exit 0
fi

echo_stderr "ERROR: failed to push gate-count refresh to ${PR_HEAD_REF}."
comment_diff_failure "the push to ${PR_HEAD_REF} was rejected"
remove_pr_label "$refresh_label"
exit 1
