#!/usr/bin/env bash
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

# Apply a PR's diff to a backport staging branch
# Usage: backport_to_staging.sh [--dry-run] [--continue] <pr_number> <target_branch>

usage() {
  cat >&2 <<EOF
Usage: $0 [--dry-run] [--continue] <pr_number> <target_branch>

Apply a PR's diff to a backport staging branch.

Arguments:
  pr_number       The GitHub PR number to backport
  target_branch   The target branch (e.g., v2, v3)

Options:
  --dry-run      Preview actions without making changes
  --continue     Continue after manually fixing conflicts

Examples:
  # Backport PR #123 to v2
  $0 123 v2

  # Dry-run to preview
  $0 --dry-run 123 v2

  # Continue after fixing conflicts
  $0 --continue 123 v2
EOF
  exit 1
}

# Parse arguments
if [[ $# -lt 2 ]]; then
  usage
fi

CONTINUE_MODE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      export DRY_RUN=1
      shift
      ;;
    --continue)
      CONTINUE_MODE=1
      shift
      ;;
    *)
      if [[ -z "${PR_NUMBER:-}" ]]; then
        PR_NUMBER="$1"
      elif [[ -z "${TARGET_BRANCH:-}" ]]; then
        TARGET_BRANCH="$1"
      else
        echo "Error: Unexpected argument '$1'" >&2
        usage
      fi
      shift
      ;;
  esac
done

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
echo "Dry Run: ${DRY_RUN:-0}"
echo "Continue Mode: $CONTINUE_MODE"
echo ""

# Set a default git committer identity
if ! git config user.name &>/dev/null; then
  git config user.name "aztec-bot"
  git config user.email "tech@aztecprotocol.com"
fi

# Get PR information
echo "Fetching PR information..."
if ! PR_INFO=$(gh pr view "$PR_NUMBER" --json number,title,state,mergedAt,body,author); then
  echo "Error: Failed to fetch PR #$PR_NUMBER" >&2
  exit 1
fi

PR_TITLE=$(echo "$PR_INFO" | jq -r '.title')
PR_STATE=$(echo "$PR_INFO" | jq -r '.state')
PR_BODY=$(echo "$PR_INFO" | jq -r '.body')
PR_MERGED_AT=$(echo "$PR_INFO" | jq -r '.mergedAt')
PR_AUTHOR=$(echo "$PR_INFO" | jq -r '.author.login // empty')
if [[ -n "$PR_AUTHOR" && "$PR_AUTHOR" != "null" ]]; then
  PR_AUTHOR_EMAIL="${PR_AUTHOR}@users.noreply.github.com"
else
  echo "Warning: Could not determine PR author, using AztecBot as fallback" >&2
  PR_AUTHOR="AztecBot"
  PR_AUTHOR_EMAIL="tech@aztec-labs.com"
fi

echo "PR Title: $PR_TITLE"
echo "PR State: $PR_STATE"
echo "Merged At: $PR_MERGED_AT"
echo "Author: $PR_AUTHOR"
echo "Author Email: $PR_AUTHOR_EMAIL"

if [[ "$PR_STATE" != "MERGED" ]]; then
  echo "Error: PR #$PR_NUMBER is not merged yet (state: $PR_STATE)" >&2
  exit 1
fi

if [[ $CONTINUE_MODE -eq 0 ]]; then
  # Fetch the target branch
  echo "Fetching origin/$TARGET_BRANCH..."
  git fetch origin "$TARGET_BRANCH"

  # Check if staging branch exists remotely
  echo "Checking for staging branch. $STAGING_BRANCH.."
  if git ls-remote --heads origin "$STAGING_BRANCH" | grep -q "$STAGING_BRANCH"; then
    echo "Staging branch exists, fetching and checking out..."
    git fetch origin "$STAGING_BRANCH"
    git checkout -B "$STAGING_BRANCH" FETCH_HEAD
  else
    echo "Creating new staging branch from origin/$TARGET_BRANCH..."
    git checkout -B "$STAGING_BRANCH" "origin/$TARGET_BRANCH"
  fi

  echo "Fetching PR diff..."

  if ! gh pr diff "$PR_NUMBER" 2>/dev/null | git apply --verbose --reject; then
    git status -s
    echo "Error: Failed to apply diff. Fix conflicts manually, then run: ./scripts/backport_to_staging.sh --continue $PR_NUMBER $TARGET_BRANCH" >&2
    exit 1
  fi
else
  echo "Continuing from previous failure..."
  # Verify we're on the correct branch
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$CURRENT_BRANCH" != "$STAGING_BRANCH" ]]; then
    echo "Error: Not on expected branch $STAGING_BRANCH (currently on $CURRENT_BRANCH)" >&2
    exit 1
  fi
fi

# Commit changes - base the commit details off of the PR title and body
echo "Diff applied successfully! Committing changes..."

# Ensure commit subject contains PR reference for get_meaningful_commits
COMMIT_SUBJECT="$PR_TITLE"
if ! echo "$COMMIT_SUBJECT" | grep -qE '\(#[0-9]+\)'; then
  COMMIT_SUBJECT="$COMMIT_SUBJECT (#$PR_NUMBER)"
fi

# Use --author to preserve original PR author while keeping the committer
# as whoever runs the script (so GPG signing works for local devs).
git add -A
git commit --author="$PR_AUTHOR <$PR_AUTHOR_EMAIL>" -m "$COMMIT_SUBJECT

$PR_BODY"

git log -1 --pretty=format:'Committed as %H by %an <%ae>%n%n%s%n%n%b'
# Push staging branch
echo "Pushing to origin/$STAGING_BRANCH..."
do_or_dryrun git push origin "$STAGING_BRANCH"

# Create or update PR
echo ""
echo "Managing PR from $STAGING_BRANCH -> $TARGET_BRANCH..."

EXISTING_PR=$(gh pr list --base "$TARGET_BRANCH" --head "$STAGING_BRANCH" --json number --jq '.[0].number' || echo "")

if [[ -z "$EXISTING_PR" ]]; then
  echo "Creating new PR..."
  do_or_dryrun gh pr create \
    --base "$TARGET_BRANCH" \
    --head "$STAGING_BRANCH" \
    --title "chore: Accumulated backports to $TARGET_BRANCH" \
    --body "Backport staging PR. Body will be updated with commit list."
  do_or_dryrun echo "Created new backport PR"
else
  echo "PR already exists (#$EXISTING_PR)"
fi

# Update PR body with commit override markers (same mechanism as merge-trains)
echo "Updating PR body with commit list..."
do_or_dryrun "$root/scripts/merge-train/update-pr-body.sh" "$STAGING_BRANCH"

do_or_dryrun echo "Successfully backported PR #$PR_NUMBER to $STAGING_BRANCH"
