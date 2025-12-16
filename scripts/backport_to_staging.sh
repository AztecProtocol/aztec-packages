#!/usr/bin/env bash
set -euo pipefail

# Script to cherry-pick PR commits to a backport staging branch
# Usage: backport_to_staging.sh [--dry-run] <pr_number> <target_branch>

DRY_RUN=false

usage() {
  cat >&2 <<EOF
Usage: $0 [--dry-run] <pr_number> <target_branch>

Cherry-pick all commits from a PR to a backport staging branch.

Arguments:
  pr_number       The GitHub PR number to backport
  target_branch   The target branch (e.g., v2, v3)

Options:
  --dry-run      Preview actions without making changes

Examples:
  # Backport PR #123 to v2
  $0 123 v2

  # Dry-run to preview
  $0 --dry-run 123 v2
EOF
  exit 1
}

# Parse arguments
if [[ $# -lt 2 ]]; then
  usage
fi

if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  shift
fi

PR_NUMBER="${1:-}"
TARGET_BRANCH="${2:-}"

if [[ -z "$PR_NUMBER" || -z "$TARGET_BRANCH" ]]; then
  usage
fi

STAGING_BRANCH="backport-to-${TARGET_BRANCH}-staging"

# Check for required tools
command -v gh >/dev/null 2>&1 || { echo "Error: 'gh' CLI not found. Install from https://cli.github.com/" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: 'jq' not found. Install jq." >&2; exit 1; }

echo "=== Backport Configuration ==="
echo "PR Number: $PR_NUMBER"
echo "Target Branch: $TARGET_BRANCH"
echo "Staging Branch: $STAGING_BRANCH"
echo "Dry Run: $DRY_RUN"
echo ""

# Get PR information
echo "Fetching PR information..."
if ! PR_INFO=$(gh pr view "$PR_NUMBER" --json number,title,state,mergedAt,commits 2>&1); then
  echo "Error: Failed to fetch PR #$PR_NUMBER" >&2
  echo "$PR_INFO" >&2
  exit 1
fi

PR_TITLE=$(echo "$PR_INFO" | jq -r '.title')
PR_STATE=$(echo "$PR_INFO" | jq -r '.state')
PR_MERGED_AT=$(echo "$PR_INFO" | jq -r '.mergedAt')
COMMIT_COUNT=$(echo "$PR_INFO" | jq '.commits | length')

echo "PR Title: $PR_TITLE"
echo "PR State: $PR_STATE"
echo "Merged At: $PR_MERGED_AT"
echo "Commits: $COMMIT_COUNT"
echo ""

if [[ "$PR_STATE" != "MERGED" ]]; then
  echo "Error: PR #$PR_NUMBER is not merged yet (state: $PR_STATE)" >&2
  exit 1
fi

# Get commit SHAs
COMMITS=$(echo "$PR_INFO" | jq -r '.commits[].oid')

if [[ -z "$COMMITS" ]]; then
  echo "Error: No commits found in PR #$PR_NUMBER" >&2
  exit 1
fi

echo "Commits to cherry-pick:"
for commit in $COMMITS; do
  echo "  - $commit"
done
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY RUN] Would perform the following actions:"
  echo "  1. Fetch origin/$TARGET_BRANCH"
  echo "  2. Create or checkout $STAGING_BRANCH"
  echo "  3. Cherry-pick $COMMIT_COUNT commit(s)"
  echo "  4. Push to origin/$STAGING_BRANCH"
  echo "  5. Create/update PR from $STAGING_BRANCH -> $TARGET_BRANCH"
  echo ""
  echo "[DRY RUN] No changes made."
  exit 0
fi

# Configure git if not already configured
if ! git config user.name >/dev/null 2>&1; then
  git config user.name "AztecBot"
  git config user.email "tech@aztecprotocol.com"
fi

# Fetch the target branch
echo "Fetching origin/$TARGET_BRANCH..."
if ! git fetch origin "$TARGET_BRANCH"; then
  echo "Error: Failed to fetch origin/$TARGET_BRANCH" >&2
  exit 1
fi

# Check if staging branch exists remotely
echo "Checking for staging branch..."
if git ls-remote --heads origin "$STAGING_BRANCH" | grep -q "$STAGING_BRANCH"; then
  echo "Staging branch exists, fetching and checking out..."
  git fetch origin "$STAGING_BRANCH"
  git checkout "$STAGING_BRANCH"
else
  echo "Creating new staging branch from origin/$TARGET_BRANCH..."
  git checkout -b "$STAGING_BRANCH" "origin/$TARGET_BRANCH"
fi

# Cherry-pick commits
echo ""
echo "Cherry-picking commits..."
CHERRY_PICK_SUCCESS=true

for commit in $COMMITS; do
  COMMIT_MSG=$(git log -1 --format='%h %s' "$commit" 2>/dev/null || echo "$commit")
  echo "Cherry-picking: $COMMIT_MSG"

  if ! git cherry-pick -x "$commit"; then
    echo "Error: Cherry-pick failed for commit $commit" >&2
    echo "Aborting cherry-pick..." >&2
    git cherry-pick --abort
    CHERRY_PICK_SUCCESS=false
    break
  fi
done

if [[ "$CHERRY_PICK_SUCCESS" == "false" ]]; then
  echo "" >&2
  echo "Cherry-pick failed with conflicts." >&2
  echo "Manual backport required for PR #$PR_NUMBER" >&2
  exit 1
fi

echo ""
echo "All commits cherry-picked successfully!"

# Push staging branch
echo "Pushing to origin/$STAGING_BRANCH..."
if ! git push origin "$STAGING_BRANCH"; then
  echo "Error: Failed to push staging branch" >&2
  exit 1
fi

# Create or update PR
echo ""
echo "Managing PR from $STAGING_BRANCH -> $TARGET_BRANCH..."

EXISTING_PR=$(gh pr list --base "$TARGET_BRANCH" --head "$STAGING_BRANCH" --json number --jq '.[0].number' || echo "")

if [[ -z "$EXISTING_PR" ]]; then
  echo "Creating new PR..."
  PR_BODY="This PR accumulates backport commits throughout the day and will be auto-merged overnight.

Latest backport: #$PR_NUMBER - $PR_TITLE

🤖 This PR is managed automatically by the backport workflow."

  gh pr create \
    --base "$TARGET_BRANCH" \
    --head "$STAGING_BRANCH" \
    --title "Accumulated backports to $TARGET_BRANCH" \
    --body "$PR_BODY"

  echo "✅ Created new backport PR"
else
  echo "PR already exists (#$EXISTING_PR), updating description..."
  CURRENT_BODY=$(gh pr view "$EXISTING_PR" --json body --jq '.body')
  NEW_BODY="${CURRENT_BODY}
- #$PR_NUMBER - $PR_TITLE"

  gh pr edit "$EXISTING_PR" --body "$NEW_BODY"
  echo "✅ Updated existing backport PR #$EXISTING_PR"
fi

echo ""
echo "✅ Successfully added PR #$PR_NUMBER to backport staging branch"
echo "   Commits: $COMMIT_COUNT"
echo "   Branch: $STAGING_BRANCH"
