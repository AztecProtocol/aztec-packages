#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
NO_CD=1 source "$root/ci3/source"
source "$root/barretenberg/cpp/scripts/pinned_chonk_inputs.sh"

hash_file="barretenberg/cpp/scripts/chonk-inputs.hash"
refresh_label="${CHONK_INPUT_REFRESH_LABEL:-ci-refresh-chonk}"
github_token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
github_repository="${GITHUB_REPOSITORY:-AztecProtocol/aztec-packages}"
state_dir="$root/.cache/chonk-inputs/ci-update"
diff_file="$state_dir/chonk-input-update.diff"

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

function upload_diff_file {
  write_diff_file
  local key run_id
  run_id="${GITHUB_RUN_ID:-manual-$(date +%s)}"
  key="chonk-input-update-diffs/${PR_NUMBER:-unknown}-${run_id}-$(git rev-parse --short HEAD).diff"
  aws s3 cp "$diff_file" "${PINNED_CHONK_S3_BUCKET}/${key}" >/dev/null
  echo "${PINNED_CHONK_BASE_URL}/${key}"
}

function comment_diff_failure {
  local reason=${1:?reason required}
  local diff_url=""
  if diff_url="$(upload_diff_file 2>/dev/null)"; then
    comment_pr "Chonk input update produced a diff, but ${reason}. Apply the diff from this artifact or rerun the update: ${diff_url}"
  else
    comment_pr "Chonk input update produced a diff, but ${reason}. I could not upload the diff artifact from CI; rerun the update locally."
  fi
}

function stage_expected_changes {
  if [[ ! -f "$hash_file" ]]; then
    echo_stderr "ERROR: Chonk input update did not produce ${hash_file}."
    return 1
  fi
  git add "$hash_file"
}

function fail_on_unstaged_changes {
  if git diff --quiet; then
    return 0
  fi

  echo_stderr "ERROR: Chonk input update produced tracked changes outside the allowed scope:"
  git diff --name-only >&2
  if [[ -n "${PR_NUMBER:-}" ]]; then
    comment_diff_failure "tracked files outside the pinned Chonk input hash scope also changed"
  fi
  return 1
}

function select_smallest_pinned_flow {
  local inputs_dir
  inputs_dir="$(pinned_chonk_inputs_dir)"
  local flow_dir size best_size="" best_flow=""

  for flow_dir in "$inputs_dir"/*/; do
    [[ -f "${flow_dir}ivc-inputs.msgpack" ]] || continue
    size="$(stat -c%s "${flow_dir}ivc-inputs.msgpack" 2>/dev/null || stat -f%z "${flow_dir}ivc-inputs.msgpack")"
    if [[ -z "$best_size" || "$size" -lt "$best_size" ]]; then
      best_size="$size"
      best_flow="$(basename "$flow_dir")"
    fi
  done

  if [[ -z "$best_flow" ]]; then
    echo_stderr "ERROR: no pinned Chonk input flows found under $inputs_dir"
    return 1
  fi

  echo "$best_flow"
}

function verify_refreshed_inputs {
  echo "Verifying refreshed Chonk inputs before push..."
  barretenberg/cpp/scripts/chonk_inputs.sh download
  local flow
  flow="$(select_smallest_pinned_flow)"
  echo "Using smallest pinned Chonk smoke-test flow: $flow"
  CHONK_PINNED_IVC_FLOW="$flow" CHONK_PINNED_IVC_FLOW_LIMIT=1 \
    barretenberg/cpp/scripts/run_test.sh bbapi_tests ChonkPinnedIvcInputsTest.AllPinnedFlows
  CHONK_PINNED_IVC_FLOW="$flow" CHONK_PINNED_IVC_FLOW_LIMIT=1 CHONK_PINNED_IVC_WASM_FLOW_LIMIT=1 \
    barretenberg/ts/bb.js/scripts/run_test.sh bbapi/chonk_pinned_inputs.test.js
}

remove_pr_label "$refresh_label"

echo "Updating Chonk inputs..."
barretenberg/cpp/scripts/chonk_inputs.sh update

verify_refreshed_inputs

stage_expected_changes
fail_on_unstaged_changes

if git diff --cached --quiet; then
  echo "Pinned Chonk input hash is already up to date."
  remove_pr_label "$refresh_label"
  exit 0
fi

new_hash="$(tr -d '[:space:]' < "$hash_file")"

if [[ -z "${PR_NUMBER:-}" || -z "${PR_HEAD_REF:-}" ]]; then
  git diff --cached --stat
  echo_stderr "ERROR: Chonk input update would change files, but this run is not attached to a PR head branch."
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
git commit -m "chore(bb): refresh pinned Chonk IVC inputs to ${new_hash}" \
  -m "Generated by ci-refresh-chonk." \
  -m "Only the pinned Chonk input hash is committed here; the immediate follow-up CI run is skipped intentionally." \
  -m "--ci-skip" \
  --no-verify

if git push origin "HEAD:refs/heads/${PR_HEAD_REF}"; then
  echo "Pushed Chonk input update to ${PR_HEAD_REF}."
  comment_pr "Pinned Chonk inputs refreshed to \`${new_hash}\`. The update commit includes a head-commit \`--ci-skip\` marker so the automatic follow-up run does not repeat CI."
  exit 0
fi

echo_stderr "ERROR: failed to push Chonk input update to ${PR_HEAD_REF}."
comment_diff_failure "the push to ${PR_HEAD_REF} was rejected"
remove_pr_label "$refresh_label"
exit 1
