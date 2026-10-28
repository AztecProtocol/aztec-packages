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
# its first parent is that base's tip. GitHub recomputes it after each push, so it is used only
# once its second parent is the commit being built.
if [ -n "$pr" ] &&
  git fetch -q "${depth[@]}" origin "+refs/pull/$pr/merge:refs/netlify/pr-merge" &&
  [ "$(git rev-parse -q --verify 'refs/netlify/pr-merge^2' || true)" = "$head" ]; then
  from='refs/netlify/pr-merge^1'
  to=refs/netlify/pr-merge
  echo "Comparing pull request #$pr with its base branch."
else
  git fetch -q "${depth[@]}" origin "+refs/heads/next:refs/remotes/origin/next" || true
  if ! from=$(git merge-base origin/next "$head"); then
    echo "No merge base with next: building."
    exit 1
  fi
  to=$head
  echo "Comparing $head with its merge base with next."
fi

if git diff --quiet "$from" "$to" -- .; then
  echo "No changes under docs/: skipping the preview."
  exit 0
fi
echo "docs/ changed: building the preview."
exit 1
