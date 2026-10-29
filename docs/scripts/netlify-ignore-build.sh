#!/usr/bin/env bash
# Netlify `ignore` command for deploy previews, run from docs/ (the Netlify base). A preview builds
# only when its pull request changes docs/. Exit 0 skips the build and any other exit builds, so
# every uncertain case builds.
set -euo pipefail

head=${COMMIT_REF:?COMMIT_REF is not set}
pr=${REVIEW_ID:-}

# Fetching with --depth into a full clone would make Netlify's cached clone shallow.
depth=()
[ "$(git rev-parse --is-shallow-repository)" = true ] && depth=(--depth=2)

# GitHub's merge ref is the pull request merged into its current base (next or a merge train), so
# its first parent is that base's tip. GitHub recomputes it shortly after each push, so it is used
# only once its second parent is the commit being built.
function merge_ref_ready {
  git fetch -q "${depth[@]}" origin "+refs/pull/$pr/merge:refs/netlify/pr-merge" &&
    [ "$(git rev-parse -q --verify 'refs/netlify/pr-merge^2' || true)" = "$head" ]
}
ready=false
if [ -n "$pr" ]; then
  for attempt in 1 2 3; do
    if merge_ref_ready; then ready=true; break; fi
    [ "$attempt" = 3 ] || sleep 10
  done
fi

# Without it (a conflicted pull request, or GitHub still recomputing) the base is unknown: build.
if ! $ready; then
  echo "No merge ref for pull request #${pr:-?} at $head: building."
  exit 1
fi

echo "Comparing pull request #$pr with its base branch."
if git diff --quiet 'refs/netlify/pr-merge^1' refs/netlify/pr-merge -- .; then
  echo "No changes under docs/: skipping the preview."
  exit 0
fi
echo "docs/ changed: building the preview."
exit 1
