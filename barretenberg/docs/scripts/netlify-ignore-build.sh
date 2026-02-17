#!/usr/bin/env bash
# Netlify ignore script: Skip builds if no docs-related files changed
# Exit 0 = skip build, Exit 1 = proceed with build
#
# This script runs from the barretenberg/docs/ directory (Netlify base)
#
# Strategy:
# - Production deploys (next branch): Compare against CACHED_COMMIT_REF (last deployed commit)
# - PR previews (other branches): Compare against merge-base with next (changes introduced by PR)
#
# This ensures:
# - Production builds when docs change on next (including nightly releases)
# - PR previews only build when the PR has docs changes (no clutter on non-docs PRs)

set -euo pipefail

BASE_BRANCH="next"

# Determine the comparison reference based on deploy context
if [ "${BRANCH:-}" = "$BASE_BRANCH" ]; then
  # Production deploy on the base branch - use CACHED_COMMIT_REF
  if [ -z "${CACHED_COMMIT_REF:-}" ]; then
    echo "Production deploy without cached commit reference - proceeding with build"
    exit 1
  fi

  # Handle edge case where CACHED_COMMIT_REF equals COMMIT_REF
  # This happens on first deploys or when Netlify's cache is in an unexpected state
  if [ "$CACHED_COMMIT_REF" = "$COMMIT_REF" ]; then
    echo "CACHED_COMMIT_REF equals COMMIT_REF ($COMMIT_REF) - cannot determine changes, proceeding with build"
    exit 1
  fi

  COMPARE_REF="$CACHED_COMMIT_REF"
  echo "Production deploy: comparing $COMMIT_REF against last deployed commit $COMPARE_REF"
else
  # PR preview or branch deploy - use merge-base to detect PR-specific changes
  # Fetch the base branch to ensure we have it available for merge-base comparison
  git fetch origin "$BASE_BRANCH" 2>/dev/null || true

  COMPARE_REF=$(git merge-base "origin/$BASE_BRANCH" "$COMMIT_REF" 2>/dev/null || echo "")

  if [ -z "$COMPARE_REF" ]; then
    echo "Could not determine merge base with $BASE_BRANCH - proceeding with build"
    exit 1
  fi
  echo "PR preview: comparing $COMMIT_REF against merge base $COMPARE_REF (from $BASE_BRANCH)"
fi

# Check for ANY changes in the docs/ directory (current directory in Netlify context)
if ! git diff --quiet "$COMPARE_REF" "$COMMIT_REF" -- .; then
  echo "Changes detected in barretenberg/docs/ directory - proceeding with build"
  exit 1
fi

# Check for changes in barretenberg/cpp/src/barretenberg (Doxygen source for API docs)
if ! git diff --quiet "$COMPARE_REF" "$COMMIT_REF" -- ../cpp/src/barretenberg; then
  echo "Changes detected in barretenberg/cpp/src/barretenberg - proceeding with build"
  exit 1
fi

# Check for changes in barretenberg/cpp/docs (Doxygen config and additional source)
if ! git diff --quiet "$COMPARE_REF" "$COMMIT_REF" -- ../cpp/docs; then
  echo "Changes detected in barretenberg/cpp/docs - proceeding with build"
  exit 1
fi

# Extract all #include_code file references from markdown files
# Pattern: #include_code identifier /path/to/file language
# Paths are relative to repo root (may start with /) or relative to docs
INCLUDE_CODE_PATHS=$(
  find . -type f \( -name "*.md" -o -name "*.mdx" \) 2>/dev/null | \
  xargs grep -h '^#include_code' 2>/dev/null | \
  awk '{ gsub("^/", "", $3); print $3 }' | \
  sort -u || true
)

# Check each referenced external file for changes
for path in $INCLUDE_CODE_PATHS; do
  if [ -n "$path" ]; then
    # Check if path exists relative to current dir or relative to repo root
    if [ -f "./$path" ]; then
      # Path is relative to docs/ - already covered by the docs/ check above
      continue
    fi
    # Path is relative to repo root
    if ! git diff --quiet "$COMPARE_REF" "$COMMIT_REF" -- "../../$path" 2>/dev/null; then
      echo "Changes detected in included file: $path - proceeding with build"
      exit 1
    fi
  fi
done

echo "No docs-related changes detected - skipping build"
exit 0
