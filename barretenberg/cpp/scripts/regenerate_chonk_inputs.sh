#!/usr/bin/env bash
# Regenerate the pinned Chonk IVC inputs end-to-end.
#
# Flow:
#   1. Build native bb (with AVM=ON) and the yarn-project bench fixtures.
#   2. Run yarn-project/end-to-end/bootstrap.sh build_bench in REGEN mode so
#      it generates fresh inputs into example-app-ivc-inputs-out instead of
#      downloading the pinned tarball.
#   3. Prove + verify every flow with the freshly built bb so we don't pin a
#      tarball that doesn't actually prove.
#   4. Upload the new tarball to S3 and write the new short hash into
#      barretenberg/cpp/scripts/chonk-inputs.hash.
#   5. (Optional) Commit the pin update and push it back to the current
#      branch, rebasing onto the latest remote head and tagging the commit
#      with [skip ci] so CI does not loop.
#
# Triggers:
#   - Locally via `test_chonk_standalone_vks_havent_changed.sh --update_inputs`.
#   - In CI via `scripts/ci_vk_update.sh`, which fires when the author has
#     pushed a `VK-UPDATE: <reason>` empty commit on their PR. In that case the
#     script is invoked with `--commit --push` and `VK_UPDATE_REASON=...`.
set -euo pipefail

source "$(git rev-parse --show-toplevel)/ci3/source"

cpp_scripts="$root/barretenberg/cpp/scripts"
source "$cpp_scripts/chonk_inputs_lib.sh"

inputs_dir="$root/yarn-project/end-to-end/example-app-ivc-inputs-out"
bb_preset="${BB_BUILD_PRESET:-${NATIVE_PRESET:-clang20}}"
bb_build_dir="$root/barretenberg/cpp/$("$cpp_scripts/preset-build-dir" "$bb_preset")"
bb="$bb_build_dir/bin/bb"

commit_changes=1
push_changes=0
reason="${VK_UPDATE_REASON:-}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-commit) commit_changes=0; push_changes=0 ;;
        --commit)    commit_changes=1 ;;
        --push)      push_changes=1; commit_changes=1 ;;
        --reason)    shift; reason="${1:-}" ;;
        --reason=*)  reason="${1#--reason=}" ;;
        -h|--help)
            cat <<EOF
Usage: $(basename "$0") [OPTIONS]

  --no-commit         Regenerate + upload, but do not touch git.
  --commit            Stage and commit the pin update (default).
  --push              Imply --commit; rebase onto remote PR head and push
                      with [skip ci] in the commit subject.
  --reason TEXT       Human-readable explanation for the regen, included in
                      the commit body (also picked up from VK_UPDATE_REASON).
EOF
            exit 0
            ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
    shift || true
done

if [[ "$commit_changes" == "1" && -z "$reason" ]]; then
    echo "regenerate_chonk_inputs.sh: --commit/--push requires --reason or VK_UPDATE_REASON" >&2
    exit 2
fi

echo_header "regenerate_chonk_inputs"
echo "bb preset:    $bb_preset"
echo "bb binary:    $bb"
echo "inputs_dir:   $inputs_dir"
echo "commit:       $commit_changes  push: $push_changes"

# 1) Ensure bb native (with AVM enabled, since the e2e flows hit AVM paths).
if [[ ! -x "$bb" ]]; then
    echo "Building bb native (AVM=ON)..."
    (cd "$root/barretenberg/cpp" && AVM=1 ./bootstrap.sh build_native)
fi

# 2) Generate fresh inputs.
echo_header "Generating fresh chonk IVC inputs (slow path)"
(
    cd "$root/yarn-project/end-to-end"
    BUILD_BENCH_REGEN=1 ./bootstrap.sh build_bench
)

# 3) Prove + verify each flow before publishing.
echo_header "Proving and verifying freshly generated flows"
(
    cd "$cpp_scripts"
    # Source the test script just for prove_and_verify_inputs; tell it not to
    # run its own dispatch logic by passing --prove_and_verify on a pre-staged
    # inputs_dir. Simpler: reuse the helper directly via subshell.
    inputs_dir="$inputs_dir" \
    bb="$bb" \
    bb_preset="$bb_preset" \
    bash -c '
        source "$(git rev-parse --show-toplevel)/ci3/source"
        function prove_and_verify_inputs {
            set -eu
            local flow_folder="$inputs_dir/$1"
            "$bb" prove --scheme chonk --ivc_inputs_path "$flow_folder/ivc-inputs.msgpack" > /dev/null 2>&1
        }
        export -f prove_and_verify_inputs
        parallel -v --line-buffer --tag prove_and_verify_inputs {} ::: $(ls "$inputs_dir")
    '
)

# 4) Upload the new tarball + rewrite the pin file.
echo_header "Uploading new pinned tarball to S3"
old_hash=$(chonk_inputs_hash)
new_hash=$(cd "$cpp_scripts" && chonk_inputs_upload "$inputs_dir")
chonk_inputs_set_pin "$new_hash"

echo "Old pinned short hash: $old_hash"
echo "New pinned short hash: $new_hash"

if [[ "$commit_changes" != "1" ]]; then
    cat <<EOF

Regeneration complete. Local pin file updated:
  $cpp_scripts/chonk-inputs.hash

Inspect the diff and commit when ready:
  git add barretenberg/cpp/scripts/chonk-inputs.hash
  git commit -m "chore(bb): regenerate pinned chonk IVC inputs"
EOF
    exit 0
fi

# 5) Commit and (optionally) push.
echo_header "Committing pin update"
cd "$root"
git add barretenberg/cpp/scripts/chonk-inputs.hash
if git diff --cached --quiet; then
    echo "No change to commit (pin already up to date)."
    exit 0
fi

commit_msg=$(cat <<EOF
chore(bb): regenerate pinned chonk IVC inputs [skip ci]

VK-UPDATE acknowledged: $reason

Old pinned short hash: $old_hash
New pinned short hash: $new_hash
EOF
)

git -c user.name="${GIT_AUTHOR_NAME:-AztecBot}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-tech@aztecprotocol.com}" \
    commit -m "$commit_msg"

if [[ "$push_changes" != "1" ]]; then
    echo "Commit created. Push manually when ready."
    exit 0
fi

# Determine the branch we should push to. In CI we trust $PR_HEAD_REF; otherwise
# use the current branch name.
target_branch="${PR_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD)}"
if [[ "$target_branch" == "HEAD" || -z "$target_branch" ]]; then
    echo "regenerate_chonk_inputs.sh: detached HEAD and no PR_HEAD_REF; refusing to push" >&2
    exit 1
fi

echo_header "Pushing pin update to $target_branch"

if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    github_repository=$(git remote get-url origin | sed -E 's|.*github\.com[/:]([^/]+/[^/]+)(\.git)?$|\1|')
    git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${github_repository}"
fi

# Rebase our single commit onto the latest remote head so we never clobber
# concurrent commits that landed on the PR branch while regen was running.
# The pin file is touched by no one but us, so conflicts are not expected; if
# we hit one anyway, abort and let a human resolve.
push_attempt=0
while true; do
    push_attempt=$((push_attempt + 1))
    if [[ $push_attempt -gt 3 ]]; then
        echo "Push retried 3 times; giving up." >&2
        exit 1
    fi

    git fetch origin "$target_branch"
    if ! git rebase "origin/$target_branch"; then
        echo "Rebase onto origin/$target_branch hit a conflict; aborting." >&2
        git rebase --abort || true
        exit 1
    fi

    if git push origin "HEAD:$target_branch"; then
        echo "Pin update pushed to $target_branch."
        exit 0
    fi

    echo "Push rejected (likely a concurrent push). Retrying after re-fetch..." >&2
    sleep 5
done
