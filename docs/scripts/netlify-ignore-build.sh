#!/usr/bin/env bash
# Netlify `ignore` command, run from docs/ (the Netlify base):
#
#   netlify-ignore-build.sh preview      a deploy preview builds only when its pull request changes docs/
#   netlify-ignore-build.sh production   a production build runs only when docs/ changed since the last
#                                        production build that passed
#
# Exit 0 skips the build and any other exit builds, so every uncertain case builds.
set -euo pipefail

function usage {
  echo "usage: $0 preview|production" >&2
  exit 2
}
[ $# = 1 ] || usage
mode=$1

head=${COMMIT_REF:?COMMIT_REF is not set}

function preview {
  local pr=${REVIEW_ID:-}

  # Fetching with --depth into a full clone would make Netlify's cached clone shallow.
  local depth=()
  [ "$(git rev-parse --is-shallow-repository)" = true ] && depth=(--depth=2)

  # GitHub's merge ref is the pull request merged into its current base (next or a merge train), so
  # its first parent is that base's tip. GitHub recomputes it shortly after each push, so it is used
  # only once its second parent is the commit being built.
  function merge_ref_ready {
    git fetch -q "${depth[@]}" origin "+refs/pull/$pr/merge:refs/netlify/pr-merge" &&
      [ "$(git rev-parse -q --verify 'refs/netlify/pr-merge^2' || true)" = "$head" ]
  }
  local ready=false
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
}

# CACHED_COMMIT_REF names the last build that saved Netlify's cache; cancelled builds, and per Netlify
# failed ones, save none. Without a cache it equals COMMIT_REF, where a plain diff would skip. Both are
# checked before they reach git and never echoed unchecked.
function production {
  local base=${CACHED_COMMIT_REF:-}
  local sha='^[0-9a-f]{40}$'

  if [[ ! $head =~ $sha ]]; then
    echo "COMMIT_REF is not a commit id: building production."
    exit 1
  fi
  if [[ ! $base =~ $sha ]] || [ "$base" = "$head" ]; then
    echo "No earlier production build to compare with: building production."
    exit 1
  fi
  # Fetching an old commit into a shallow clone without a depth can pull unbounded history.
  if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
    echo "Shallow clone, so the history cannot be checked: building production."
    exit 1
  fi
  if ! git cat-file -e "$base^{commit}" 2>/dev/null && ! git fetch -q origin "$base"; then
    echo "Cannot fetch ${base:0:10}, the last production build: building production."
    exit 1
  fi
  # A baseline from another branch's cache says nothing about what production serves.
  if ! git merge-base --is-ancestor "$base" "$head"; then
    echo "${base:0:10} is not on this branch's history: building production."
    exit 1
  fi
  if git diff --quiet "$base" "$head" -- .; then
    echo "No change under docs/ since ${base:0:10}: skipping production."
    exit 0
  fi
  echo "docs/ changed since ${base:0:10}: building production."
  exit 1
}

case $mode in
  preview) preview ;;
  production) production ;;
  *) usage ;;
esac
