#!/usr/bin/env bash
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

# Cherry-pick a merged PR onto its backport merge-train branch.
# The branch is named merge-train/<target_branch> (e.g. merge-train/v2).
# On first push, merge-train-create-pr.yml auto-creates the PR targeting <target_branch>.
# Usage: backport_to_staging.sh [--dry-run] [--continue] <pr_number> <target_branch>

usage() {
  cat >&2 <<EOF
Usage: $0 [--dry-run] [--continue] <pr_number> <target_branch>

Cherry-pick a merged PR onto its backport merge-train branch.

Arguments:
  pr_number       The GitHub PR number to backport
  target_branch   The target branch (e.g., v2, v3)

Options:
  --dry-run      Preview actions without making changes
  --continue     Continue after manually fixing conflicts

Examples:
  # Backport PR #123 to v2  (pushes to merge-train/v2)
  $0 123 v2

  # Dry-run to preview
  $0 --dry-run 123 v2

  # Continue after fixing conflicts manually
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

TRAIN_BRANCH="merge-train/${TARGET_BRANCH}"

# Check for required tools
command -v gh >/dev/null 2>&1 || { echo "Error: 'gh' CLI not found. Install from https://cli.github.com/" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: 'jq' not found. Install jq." >&2; exit 1; }

echo "=== Backport Configuration ==="
echo "PR Number:    $PR_NUMBER"
echo "Target:       $TARGET_BRANCH"
echo "Train Branch: $TRAIN_BRANCH"
echo "Dry Run:      ${DRY_RUN:-0}"
echo "Continue:     $CONTINUE_MODE"
echo ""

# Set a default git committer identity
if ! git config user.name &>/dev/null; then
  git config user.name "aztec-bot"
  git config user.email "tech@aztecprotocol.com"
fi

# Get PR information via gh using AZTEC_BOT_GITHUB_TOKEN (set GH_TOKEN in the workflow).
echo "Fetching PR information..."
if ! PR_INFO=$(gh pr view "$PR_NUMBER" --json number,title,state,mergedAt,body,author,mergeCommit); then
  echo "Error: Failed to fetch PR #$PR_NUMBER" >&2
  exit 1
fi
PR_TITLE=$(echo "$PR_INFO" | jq -r '.title')
PR_STATE=$(echo "$PR_INFO" | jq -r '.state')
PR_BODY=$(echo "$PR_INFO" | jq -r '.body')
MERGE_COMMIT=$(echo "$PR_INFO" | jq -r '.mergeCommit.oid // empty')
PR_AUTHOR=$(echo "$PR_INFO" | jq -r '.author.login // empty')

if [[ -n "$PR_AUTHOR" && "$PR_AUTHOR" != "null" && "$PR_AUTHOR" != "AztecBot" ]]; then
  PR_AUTHOR_EMAIL="${PR_AUTHOR}@users.noreply.github.com"
else
  PR_AUTHOR="AztecBot"
  PR_AUTHOR_EMAIL="tech@aztec-labs.com"
fi

echo "PR Title:     $PR_TITLE"
echo "PR State:     $PR_STATE"
echo "Merge Commit: $MERGE_COMMIT"
echo "Author:       $PR_AUTHOR"

if [[ "$PR_STATE" != "MERGED" ]]; then
  echo "Error: PR #$PR_NUMBER is not merged yet (state: $PR_STATE)" >&2
  exit 1
fi

if [[ $CONTINUE_MODE -eq 0 ]]; then
  # Fetch the target branch and the merge commit
  echo "Fetching origin/$TARGET_BRANCH..."
  git fetch origin "$TARGET_BRANCH"

  if [[ -n "$MERGE_COMMIT" ]]; then
    echo "Fetching merge commit $MERGE_COMMIT..."
    git fetch origin "$MERGE_COMMIT"
  fi

  # Check if train branch exists remotely; create from target if not
  echo "Checking for train branch $TRAIN_BRANCH..."
  if git ls-remote --heads origin "refs/heads/$TRAIN_BRANCH" | grep -q .; then
    echo "Train branch exists, fetching and checking out..."
    git fetch origin "$TRAIN_BRANCH"
    git checkout -B "$TRAIN_BRANCH" FETCH_HEAD
  else
    echo "Creating new train branch from origin/$TARGET_BRANCH..."
    git checkout -B "$TRAIN_BRANCH" "origin/$TARGET_BRANCH"
  fi

  HAS_CONFLICTS=0
  if [[ -n "$MERGE_COMMIT" ]]; then
    echo "Cherry-picking $MERGE_COMMIT..."
    # -m 1 selects the first parent (the branch the PR merged into) for merge commits.
    # --no-commit applies changes without committing so we can set author/message below.
    if ! git cherry-pick -m 1 --no-commit "$MERGE_COMMIT"; then
      echo "Warning: Cherry-pick had conflicts. Committing with conflict markers." >&2
      HAS_CONFLICTS=1
      # Quit cherry-pick state but keep working tree (conflict markers intact)
      git cherry-pick --quit
    fi
  else
    echo "No merge commit SHA available, falling back to PR diff..." >&2
    PR_DIFF=$(gh pr diff "$PR_NUMBER" 2>/dev/null)
    if [[ -z "$PR_DIFF" ]]; then
      echo "Error: Could not fetch diff for PR #$PR_NUMBER" >&2
      exit 1
    fi
    if ! echo "$PR_DIFF" | git apply --reject --verbose; then
      echo "Warning: Diff did not apply cleanly. Committing what we have." >&2
      HAS_CONFLICTS=1
    fi
  fi
else
  echo "Continuing from previous conflict resolution..."
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$CURRENT_BRANCH" != "$TRAIN_BRANCH" ]]; then
    echo "Error: Not on expected branch $TRAIN_BRANCH (currently on $CURRENT_BRANCH)" >&2
    exit 1
  fi
fi

# Ensure commit subject contains PR reference for get_meaningful_commits
COMMIT_SUBJECT="$PR_TITLE"
if ! echo "$COMMIT_SUBJECT" | grep -qE '\(#[0-9]+\)'; then
  COMMIT_SUBJECT="$COMMIT_SUBJECT (#$PR_NUMBER)"
fi

# Prefix with CONFLICTS so it's obvious in the train PR commit list
if [[ "${HAS_CONFLICTS:-0}" -eq 1 ]]; then
  COMMIT_SUBJECT="CONFLICTS: $COMMIT_SUBJECT"
  echo "Committing with conflict markers..."
else
  echo "Committing..."
fi

# Preserve original PR author; committer is whoever runs the script.
COMMIT_MSG_FILE=$(mktemp)
printf '%s\n\n%s\n' "$COMMIT_SUBJECT" "$PR_BODY" > "$COMMIT_MSG_FILE"
do_or_dryrun git add -A
do_or_dryrun git commit --no-gpg-sign --author="$PR_AUTHOR <$PR_AUTHOR_EMAIL>" -F "$COMMIT_MSG_FILE"
rm -f "$COMMIT_MSG_FILE"

git log -1 --pretty=format:'Committed as %H by %an <%ae>%n%n%s%n%n%b'

# Signal to the caller whether conflicts were present
if [[ "${HAS_CONFLICTS:-0}" -eq 1 ]]; then
  echo "has_conflicts=true" >> "${GITHUB_OUTPUT:-/dev/null}"
else
  echo "has_conflicts=false" >> "${GITHUB_OUTPUT:-/dev/null}"
fi

# Push — merge-train-create-pr.yml creates the PR on first push;
#         merge-train-update-pr-body.yml updates the body on every push.
echo "Pushing to origin/$TRAIN_BRANCH..."
do_or_dryrun git push origin "$TRAIN_BRANCH"

do_or_dryrun echo "Done: PR #$PR_NUMBER → $TRAIN_BRANCH"
