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

# STAGING_BRANCH, STAGING_PR_TITLE and STAGING_PR_LABELS may be pre-set in the
# environment to reuse this script for non-backport ports (e.g. the
# port-to-next label, which targets next and needs ci-no-squash). They default
# to the backport naming with no extra labels.
STAGING_BRANCH="${STAGING_BRANCH:-backport-to-${TARGET_BRANCH}-staging}"
STAGING_PR_TITLE="${STAGING_PR_TITLE:-chore: Accumulated backports to $TARGET_BRANCH}"
STAGING_PR_LABELS="${STAGING_PR_LABELS:-}"

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

  # Get merge commit SHA and cherry-pick (preserves author and message)
  echo "Fetching merge commit..."
  MERGE_COMMIT=$(gh pr view "$PR_NUMBER" --json mergeCommit --jq '.mergeCommit.oid')
  if [[ -z "$MERGE_COMMIT" || "$MERGE_COMMIT" == "null" ]]; then
    echo "Error: Could not find merge commit for PR #$PR_NUMBER" >&2
    exit 1
  fi
  echo "Merge commit: $MERGE_COMMIT"
  git fetch origin "$MERGE_COMMIT"

  # When forward-porting into next, skip release-line artifacts that are
  # meaningless on the mainline: release-version bumps, per-release upgrade/deploy
  # scripts, regenerated-fixture refreshes, and the plumbing commits a release
  # line creates when it merges its own public snapshot. A PR is skipped only when
  # its subject marks it as such, or every file it touches is an artifact path.
  if [[ "$TARGET_BRANCH" == "next" ]]; then
    EXCLUDE_SUBJECTS='^chore\(release\)|regenerate pinned|re-pin standard contracts|regenerate standard-contract|resolve v[0-9]+ -> v[0-9]+-next|public-v[0-9]+-next merge|refresh pinned'
    EXCLUDE_GLOBS=('l1-contracts/src/periphery/V*UpgradePayload*' 'l1-contracts/script/deploy/DeployRollupForUpgrade*' 'l1-contracts/*/V*_UPGRADE_RUNBOOK.md' '.github/workflows/*-v*-next.yml')
    MERGE_SUBJECT=$(git show -s --format=%s "$MERGE_COMMIT")
    SKIP_ARTIFACT=0
    if [[ "$MERGE_SUBJECT" =~ $EXCLUDE_SUBJECTS ]]; then
      SKIP_ARTIFACT=1
    else
      ALL_EXCLUDED=1
      while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        matched=0
        for g in "${EXCLUDE_GLOBS[@]}"; do
          # shellcheck disable=SC2254
          case "$f" in $g) matched=1; break ;; esac
        done
        [[ $matched -eq 0 ]] && { ALL_EXCLUDED=0; break; }
      done < <(git diff --no-renames --name-only "${MERGE_COMMIT}^1" "$MERGE_COMMIT")
      [[ $ALL_EXCLUDED -eq 1 ]] && SKIP_ARTIFACT=1
    fi
    if [[ $SKIP_ARTIFACT -eq 1 ]]; then
      echo "Skipping PR #$PR_NUMBER: release-line artifact, not forward-ported to $TARGET_BRANCH."
      exit 0
    fi
  fi

  # Detect if merge commit has multiple parents (merge commit vs squash commit)
  PARENT_COUNT=$(git rev-list --parents -n 1 "$MERGE_COMMIT" | wc -w)
  # First word is the commit itself, remaining are parents
  if [[ $PARENT_COUNT -gt 2 ]]; then
    echo "Merge commit has multiple parents, using -m 1 for cherry-pick"
    CHERRY_PICK_ARGS="-m 1"
  else
    CHERRY_PICK_ARGS=""
  fi

  echo "Cherry-picking $MERGE_COMMIT..."
  if ! git cherry-pick $CHERRY_PICK_ARGS "$MERGE_COMMIT" --no-edit; then
    # No unmerged paths means the patch applied to nothing: the change is already
    # present in the target (e.g. a fix that also reached next independently, or
    # a next->release backport bounced back). Skip it quietly instead of treating
    # it as a conflict, so auto-forward-porting does not raise false alarms.
    if [[ -z "$(git diff --name-only --diff-filter=U)" ]]; then
      git cherry-pick --skip >/dev/null 2>&1 || git reset --hard >/dev/null
      echo "PR #$PR_NUMBER is already present in $TARGET_BRANCH; nothing to port."
      exit 0
    fi
    git cherry-pick --abort 2>/dev/null || true
    # Tell the workflow this was a genuine conflict, so it can distinguish it
    # from any other way this script can fail.
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
      echo "failure_reason=conflict" >> "$GITHUB_OUTPUT"
    fi
    echo "Error: Failed to cherry-pick. Fix conflicts manually, then run: ./scripts/backport_to_staging.sh --continue $PR_NUMBER $TARGET_BRANCH" >&2
    exit 1
  fi
  echo "Cherry-pick applied successfully!"
else
  echo "Continuing from previous failure..."
  # Verify we're on the correct branch
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$CURRENT_BRANCH" != "$STAGING_BRANCH" ]]; then
    echo "Error: Not on expected branch $STAGING_BRANCH (currently on $CURRENT_BRANCH)" >&2
    exit 1
  fi

  # Commit the manually resolved changes
  echo "Committing resolved changes..."
  COMMIT_SUBJECT="$PR_TITLE"
  if ! echo "$COMMIT_SUBJECT" | grep -qE '\(#[0-9]+\)'; then
    COMMIT_SUBJECT="$COMMIT_SUBJECT (#$PR_NUMBER)"
  fi
  git add -A
  git commit --author="$PR_AUTHOR <$PR_AUTHOR_EMAIL>" -m "$COMMIT_SUBJECT

$PR_BODY"
fi

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
  CREATE_ARGS=(
    --base "$TARGET_BRANCH"
    --head "$STAGING_BRANCH"
    --title "$STAGING_PR_TITLE"
    --body "Backport staging PR. Body will be updated with commit list."
  )
  if [[ -n "$STAGING_PR_LABELS" ]]; then
    CREATE_ARGS+=(--label "$STAGING_PR_LABELS")
  fi
  do_or_dryrun gh pr create "${CREATE_ARGS[@]}"
  do_or_dryrun echo "Created new backport PR"
else
  echo "PR already exists (#$EXISTING_PR)"
  # Ensure required labels are present on a pre-existing staging PR too.
  if [[ -n "$STAGING_PR_LABELS" ]]; then
    do_or_dryrun gh pr edit "$EXISTING_PR" --add-label "$STAGING_PR_LABELS"
  fi
fi

# Update PR body with commit override markers (same mechanism as merge-trains).
# The branch is pushed and the staging PR exists by this point, so a failure
# here must not fail the backport: the caller reports any non-zero exit as a
# cherry-pick conflict, which would be a lie and would page #backports.
echo "Updating PR body with commit list..."
if ! do_or_dryrun "$root/scripts/merge-train/update-pr-body.sh" "$STAGING_BRANCH"; then
  echo "Warning: could not update the staging PR body; the backport itself succeeded." >&2
fi

do_or_dryrun echo "Successfully backported PR #$PR_NUMBER to $STAGING_BRANCH"
