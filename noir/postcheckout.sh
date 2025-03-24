#!/usr/bin/env bash
# Post-checkout hook for warning the user to create a patch file before running a build,
# if there are outstanding commits that could get lost if we switch to a different noir-repo checkout.
set -euo pipefail

cd $(dirname $0)

is_branch=${3:-}

if [ "$is_branch" == "1" ] && scripts/sync.sh needs-patch; then
    echo "Warning: the noir-repo has outstanding commits that need to be put in a patch file"
    echo "with the './noir/bootstrap.sh make-patch' command, then committed to the appropriate branch"
    echo "in aztec-packages in order to ensure they don't get lost if the noir-repo is switched."
fi
