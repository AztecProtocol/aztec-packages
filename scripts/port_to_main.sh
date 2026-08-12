#!/usr/bin/env bash
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

# Keep a long-lived branch that accumulates everything from a source branch
# that is not yet in main, and open/update a single PR against main. Intended
# to run daily to forward-port a release line into main.
#
# The port branch is long-lived: each run checks it out and merges main and the
# source into it, so any manual conflict resolution pushed to the branch is
# preserved. Once the PR is merged (branch fully contained in main), the next
# run rebuilds the branch fresh from main.
#
# Merge conflicts do NOT abandon the run: the conflicted merge is committed with
# markers so the PR is still opened/updated as a resolution target, and the
# conflicted files are reported (via step outputs) for a Slack notification.
#
# Usage: port_to_main.sh <source_branch>

SOURCE_BRANCH="${1:?Usage: $0 <source_branch>}"
TARGET_BRANCH="main"
PORT_BRANCH="port-${SOURCE_BRANCH}-to-${TARGET_BRANCH}"
PR_TITLE="chore: port $SOURCE_BRANCH to $TARGET_BRANCH"

command -v gh >/dev/null 2>&1 || { echo "Error: 'gh' CLI not found." >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: 'jq' not found." >&2; exit 1; }

# Set a default git committer identity
if ! git config user.name &>/dev/null; then
  git config user.name "aztec-bot"
  git config user.email "tech@aztecprotocol.com"
fi

# Accumulates "<ref>: file, file" lines for any merge that conflicted.
CONFLICT_SUMMARY=""

function branch_exists {
  git ls-remote --exit-code --heads origin "$1" >/dev/null 2>&1
}

# Merge a ref into the current branch. On conflict, commit the merge with
# markers (rather than aborting) so the PR surfaces it for manual resolution,
# and record the conflicted files.
function merge_ref {
  local ref="$1"
  echo "Merging $ref into $PORT_BRANCH..."
  if git merge "$ref" --no-edit -m "Merge $ref into $PORT_BRANCH"; then
    return 0
  fi
  local conflicts=$(git diff --name-only --diff-filter=U)
  echo "Conflicts merging $ref (committing with markers for manual resolution):" >&2
  echo "$conflicts" >&2
  git add -A
  git commit -m "Merge $ref into $PORT_BRANCH (CONFLICTS - manual resolution needed)"
  CONFLICT_SUMMARY+="${ref}: $(echo "$conflicts" | paste -sd ', ' -)"$'\n'
}

echo "=== Port Configuration ==="
echo "Source Branch: $SOURCE_BRANCH"
echo "Target Branch: $TARGET_BRANCH"
echo "Port Branch:   $PORT_BRANCH"
echo ""

echo "Fetching origin/$TARGET_BRANCH and origin/$SOURCE_BRANCH..."
git fetch origin "$TARGET_BRANCH" "$SOURCE_BRANCH"

# Decide whether to continue an existing port branch or start fresh. We start
# fresh from main when the branch is absent or already fully merged into main
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

# Keep current with main (surfaces conflicts early, keeps the PR mergeable),
# then pull in the source branch.
merge_ref "origin/$TARGET_BRANCH"
merge_ref "origin/$SOURCE_BRANCH"

EXISTING_PR=$(gh pr list --state open --base "$TARGET_BRANCH" --head "$PORT_BRANCH" --json number --jq '.[0].number' || echo "")

# Nothing to port if there is no delta over the target. A conflict is itself a
# delta (markers were committed), so this only triggers on a clean no-op.
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

# Expose results for the workflow (PR link, and conflicts if any) so it can
# notify Slack. Guarded so the script still works when run locally.
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  PR_URL=$(gh pr view "$PORT_BRANCH" --json url --jq '.url' 2>/dev/null || echo "")
  echo "pr_url=$PR_URL" >> "$GITHUB_OUTPUT"
  if [[ -n "$CONFLICT_SUMMARY" ]]; then
    {
      echo "conflicts<<PORT_CONFLICTS_EOF"
      printf '%s' "$CONFLICT_SUMMARY"
      echo "PORT_CONFLICTS_EOF"
    } >> "$GITHUB_OUTPUT"
  fi
fi

if [[ -n "$CONFLICT_SUMMARY" ]]; then
  echo "Ported $SOURCE_BRANCH to $PORT_BRANCH WITH CONFLICTS (see PR for markers):"
  printf '%s' "$CONFLICT_SUMMARY"
else
  do_or_dryrun echo "Successfully ported $SOURCE_BRANCH to $PORT_BRANCH"
fi
