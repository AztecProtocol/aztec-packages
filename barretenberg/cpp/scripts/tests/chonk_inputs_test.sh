#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
export GIT_AUTHOR_NAME=Test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=Test GIT_COMMITTER_EMAIL=test@example.com
unset PR_NUMBER

mkdir -p "$fixture/ci3" "$fixture/barretenberg/cpp/scripts" "$fixture/labs/yarn-project/end-to-end"
: > "$fixture/ci3/source"
printf '0123456789abcdef\n' > "$fixture/barretenberg/cpp/scripts/chonk-inputs.hash"
cp "$repo_root/barretenberg/cpp/scripts/pinned_chonk_inputs.sh" "$fixture/barretenberg/cpp/scripts/"
git -C "$fixture" init -q
git -C "$fixture/labs" init -q
printf 'base\n' > "$fixture/labs/tracked"
git -C "$fixture/labs" add tracked
git -C "$fixture/labs" commit -qm 'test: base'
git -C "$fixture" add ci3 barretenberg
git -C "$fixture" update-index --add --cacheinfo "160000,$(git -C "$fixture/labs" rev-parse HEAD),labs"
git -C "$fixture" commit -qm 'test: foundation'
printf 'patched\n' > "$fixture/labs/tracked"
git -C "$fixture/labs" commit -qam 'test: applied labs patch'

cd "$fixture"
source <(sed '/^remove_pr_label "\$refresh_label"$/,$d' "$repo_root/barretenberg/cpp/scripts/ci_update_chonk_inputs.sh")

cd labs/yarn-project/end-to-end
actual=$(chonk_capture_dir)
expected="$fixture/labs/yarn-project/end-to-end/chonk-pinned-flows"
[[ "$actual" == "$expected" ]] || { printf 'FAIL: capture path: %s, expected: %s\n' "$actual" "$expected"; exit 1; }
[[ "$(pinned_chonk_inputs_dir)" == "$fixture/barretenberg/cpp/chonk-pinned-flows" ]]
cd "$fixture"

fail_on_unstaged_changes
printf 'dirty\n' >> ci3/source
if fail_on_unstaged_changes 2>/dev/null; then
  echo 'FAIL: accepted an unexpected foundation edit'
  exit 1
fi
: > ci3/source
printf 'dirty\n' >> labs/tracked
if fail_on_unstaged_changes 2>/dev/null; then
  echo 'FAIL: accepted an unexpected labs edit'
  exit 1
fi
git -C labs add tracked
if fail_on_unstaged_changes 2>/dev/null; then
  echo 'FAIL: accepted an unexpected staged labs edit'
  exit 1
fi

echo 'PASS: capture paths and refresh change guard with patched labs'
