#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Check that staged */yarn.lock files are empty.
# These must exist (to prevent yarn using parent monorepo lockfile)
# but must remain empty — bootstrap fills them with machine-specific paths.

staged_lockfiles=$(git diff --cached --relative --name-only -- '*/yarn.lock' || true)
[ -z "$staged_lockfiles" ] && exit 0

fixed=false
for lockfile in $staged_lockfiles; do
    [ -f "$lockfile" ] || continue
    if [ -s "$lockfile" ]; then
        echo "pre-commit: emptying $lockfile (must be committed empty)"
        > "$lockfile"
        git add "$lockfile"
        fixed=true
    fi
done

if [ "$fixed" = true ]; then
    echo "pre-commit: yarn.lock files were non-empty and have been emptied."
fi
