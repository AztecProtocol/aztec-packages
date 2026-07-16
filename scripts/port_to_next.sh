#!/usr/bin/env bash
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

# Rebuild a branch containing everything in a source branch (default v5-next)
# that is not yet in next, and open/update a single PR against next. Intended
# to run daily to forward-port a release line into next.
#
# The port branch is rebuilt fresh from next on every run, so the PR always
# reflects the current delta. Manual conflict fixes on the branch are NOT
# preserved -- conflicts are expected to be resolved at the source instead.
#
# Usage: port_to_next.sh [source_branch]

SOURCE_BRANCH="${1:-v5-next}"
TARGET_BRANCH="next"
PORT_BRANCH="port-${SOURCE_BRANCH}-to-${TARGET_BRANCH}"
PR_TITLE="chore: port $SOURCE_BRANCH to $TARGET_BRANCH"

command -v gh >/dev/null 2>&1 || { echo "Error: 'gh' CLI not found." >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: 'jq' not found." >&2; exit 1; }

# Set a default git committer identity
if ! git config user.name &>/dev/null; then
  git config user.name "aztec-bot"
  git config user.email "tech@aztecprotocol.com"
fi

echo "=== Port Configuration ==="
echo "Source Branch: $SOURCE_BRANCH"
echo "Target Branch: $TARGET_BRANCH"
echo "Port Branch:   $PORT_BRANCH"
echo ""

echo "Fetching origin/$TARGET_BRANCH and origin/$SOURCE_BRANCH..."
git fetch origin "$TARGET_BRANCH" "$SOURCE_BRANCH"

# Rebuild the port branch fresh from the target each run.
git checkout -B "$PORT_BRANCH" "origin/$TARGET_BRANCH"

echo "Merging origin/$SOURCE_BRANCH into $PORT_BRANCH..."
if ! git merge "origin/$SOURCE_BRANCH" --no-edit -m "Merge $SOURCE_BRANCH into $TARGET_BRANCH"; then
  conflicts=$(git diff --name-only --diff-filter=U)
  git merge --abort || true
  echo "Error: merge conflicts between $SOURCE_BRANCH and $TARGET_BRANCH:" >&2
  echo "$conflicts" >&2
  exit 1
fi

# Find any existing open PR up front.
EXISTING_PR=$(gh pr list --state open --base "$TARGET_BRANCH" --head "$PORT_BRANCH" --json number --jq '.[0].number' || echo "")

# Nothing to port if the merge produced no delta over the target.
if git diff --quiet "origin/$TARGET_BRANCH" HEAD; then
  echo "No commits in $SOURCE_BRANCH that are missing from $TARGET_BRANCH."
  if [[ -n "$EXISTING_PR" ]]; then
    echo "Closing stale PR #$EXISTING_PR (nothing left to port)."
    do_or_dryrun gh pr close "$EXISTING_PR" \
      --comment "Nothing left to port: \`$SOURCE_BRANCH\` is fully contained in \`$TARGET_BRANCH\`."
  fi
  exit 0
fi

echo "Force-pushing $PORT_BRANCH..."
do_or_dryrun git push --force origin "$PORT_BRANCH"

if [[ -z "$EXISTING_PR" ]]; then
  echo "Creating PR..."
  do_or_dryrun gh pr create \
    --base "$TARGET_BRANCH" \
    --head "$PORT_BRANCH" \
    --title "$PR_TITLE" \
    --body "Daily forward-port of \`$SOURCE_BRANCH\` into \`$TARGET_BRANCH\`. Body will be updated with the commit list." \
    --label "ci-no-squash"
else
  echo "PR already exists (#$EXISTING_PR)"
fi

echo "Updating PR body with commit list..."
do_or_dryrun "$root/scripts/merge-train/update-pr-body.sh" "$PORT_BRANCH"

do_or_dryrun echo "Successfully ported $SOURCE_BRANCH to $PORT_BRANCH"
