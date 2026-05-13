#!/usr/bin/env bash
# CI auto-regeneration hook for the pinned Chonk IVC inputs.
#
# Called by `./bootstrap.sh ci-fast` and `ci-full` when the main test pass has
# failed. Scans the PR's commit log for an empty `VK-UPDATE: <reason>` commit;
# if one is present, runs `regenerate_chonk_inputs.sh --push` to rebuild the
# tarball, upload it to S3, update `barretenberg/cpp/scripts/chonk-inputs.hash`,
# rebase the change onto the latest PR head, and push it back with `[skip ci]`
# in the commit subject.
#
# If no VK-UPDATE commit is present, this is a no-op (the original CI failure
# stands and the engineer is expected to investigate).
set -euo pipefail

NO_CD=1 source "$(git rev-parse --show-toplevel)/ci3/source"

function main {
    echo_header "ci_vk_update"

    local reason
    reason=$(git log --format=%B -n "${PR_COMMITS:-50}" HEAD \
        | grep -m1 '^VK-UPDATE:' \
        | sed -E 's/^VK-UPDATE:[[:space:]]*//' || true)

    if [[ -z "$reason" ]]; then
        cat <<'EOF'
No VK-UPDATE commit found on this PR. The original CI failure stands.

If the failure was a Chonk VK consistency check and the change is intentional,
acknowledge it with:

  git commit --allow-empty -m "VK-UPDATE: <one-line reason VKs changed>"
  git push

CI will then auto-regenerate the pinned inputs, upload a new S3 tarball, and
push the pin update back to your PR.
EOF
        return 0
    fi

    echo "Found VK-UPDATE commit: $reason"
    echo "Regenerating pinned chonk IVC inputs..."

    VK_UPDATE_REASON="$reason" \
        ./barretenberg/cpp/scripts/regenerate_chonk_inputs.sh --push --reason "$reason"

    echo "Pin update complete. A new CI run will fire for the pushed commit."
}

main "$@"
