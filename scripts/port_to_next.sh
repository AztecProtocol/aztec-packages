#!/usr/bin/env bash
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

# Keep a long-lived branch that accumulates everything from a source branch
# (default v5-next) that is not yet in next, and open/update a single PR
# against next. Intended to run daily to forward-port a release line into next.
#
# The port branch is long-lived: each run checks it out and merges next and the
# source into it, so any manual conflict resolution pushed to the branch is
# preserved. Once the PR is merged (branch fully contained in next), the next
# run rebuilds the branch fresh from next.
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

function branch_exists {
  git ls-remote --exit-code --heads origin "$1" >/dev/null 2>&1
}

# Merge a ref into the current branch, or abort + report conflicts and exit.
function merge_or_fail {
  local ref="$1"
  echo "Merging $ref into $PORT_BRANCH..."
  if git merge "$ref" --no-edit -m "Merge $ref into $PORT_BRANCH"; then
    return 0
  fi
  local conflicts=$(git diff --name-only --diff-filter=U)
  git merge --abort || true
  echo "Error: merge conflicts merging $ref into $PORT_BRANCH:" >&2
  echo "$conflicts" >&2
  echo "Resolve by checking out $PORT_BRANCH, merging $ref, and pushing the fix." >&2
  exit 1
}

echo "=== Port Configuration ==="
echo "Source Branch: $SOURCE_BRANCH"
echo "Target Branch: $TARGET_BRANCH"
echo "Port Branch:   $PORT_BRANCH"
echo ""

echo "Fetching origin/$TARGET_BRANCH and origin/$SOURCE_BRANCH..."
git fetch origin "$TARGET_BRANCH" "$SOURCE_BRANCH"

# Decide whether to continue an existing port branch or start fresh. We start
# fresh from next when the branch is absent or already fully merged into next
# (i.e. a prior PR landed); otherwise we keep accumulating so that any pushed
# conflict resolution is preserved. A non-force push suffices while continuing;
# a fresh rebuild diverges from the remote branch and needs a force push.
FORCE_ARGS=()
if branch_exists "$PORT_BRANCH"; then
  git fetch origin "$PORT_BRANCH"
  if git merge-base --is-ancestor FETCH_HEAD "origin/$TARGET_BRANCH"; then
    echo "Existing $PORT_BRANCH is fully contained in $TARGET_BRANCH; rebuilding fresh."
    git checkout -B "$PORT_BRANCH" "origin/$TARGET_BRANCH"
    FORCE_ARGS=(--force-with-lease)
  else
    echo "Continuing existing $PORT_BRANCH."
    git checkout -B "$PORT_BRANCH" FETCH_HEAD
  fi
else
  echo "Creating $PORT_BRANCH from origin/$TARGET_BRANCH."
  git checkout -B "$PORT_BRANCH" "origin/$TARGET_BRANCH"
  FORCE_ARGS=(--force-with-lease)
fi

# Keep current with next (surfaces conflicts early, keeps the PR mergeable),
# then pull in the source branch.
merge_or_fail "origin/$TARGET_BRANCH"
merge_or_fail "origin/$SOURCE_BRANCH"

EXISTING_PR=$(gh pr list --state open --base "$TARGET_BRANCH" --head "$PORT_BRANCH" --json number --jq '.[0].number' || echo "")

# Nothing to port if there is no delta over the target.
if git diff --quiet "origin/$TARGET_BRANCH" HEAD; then
  echo "No commits in $SOURCE_BRANCH that are missing from $TARGET_BRANCH."
  if [[ -n "$EXISTING_PR" ]]; then
    echo "Closing stale PR #$EXISTING_PR (nothing left to port)."
    do_or_dryrun gh pr close "$EXISTING_PR" \
      --comment "Nothing left to port: \`$SOURCE_BRANCH\` is fully contained in \`$TARGET_BRANCH\`."
  fi
  exit 0
fi

echo "Pushing $PORT_BRANCH..."
do_or_dryrun git push "${FORCE_ARGS[@]}" origin "$PORT_BRANCH"

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
