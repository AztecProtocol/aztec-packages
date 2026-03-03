#!/usr/bin/env bash
set -euo pipefail

# Find failed backports and determine which have been manually resolved vs missed.
#
# Usage: ./scripts/find_missing_backports.sh [--since YYYY-MM-DD] [--branch TARGET]
#
# Requires: gh, jq

REPO="AztecProtocol/aztec-packages"
SINCE="2026-02-22"
TARGET_BRANCH="v4"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --since)
      SINCE="$2"
      shift 2
      ;;
    --branch)
      TARGET_BRANCH="$2"
      shift 2
      ;;
    *)
      echo "Usage: $0 [--since YYYY-MM-DD] [--branch TARGET]" >&2
      exit 1
      ;;
  esac
done

STAGING_BRANCH="backport-to-${TARGET_BRANCH}-staging"
LABEL="backport-to-${TARGET_BRANCH}"

command -v gh >/dev/null 2>&1 || { echo "Error: 'gh' CLI not found." >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: 'jq' not found." >&2; exit 1; }

echo "=== Finding Missing $TARGET_BRANCH Backports ==="
echo "Repo: $REPO"
echo "Target branch: $TARGET_BRANCH"
echo "Since: $SINCE"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Get all merged PRs with $LABEL label since $SINCE
# ---------------------------------------------------------------------------
echo "Step 1: Fetching merged PRs with '$LABEL' label since $SINCE ..."

ALL_PRS=$(gh pr list --repo "$REPO" \
  --label "$LABEL" \
  --state merged \
  --search "merged:>=$SINCE" \
  --json number,title \
  --limit 200)

TOTAL_COUNT=$(echo "$ALL_PRS" | jq 'length')
echo "  Found $TOTAL_COUNT merged PRs with $LABEL label."

if [[ "$TOTAL_COUNT" -eq 0 ]]; then
  echo "No PRs found. Nothing to do."
  exit 0
fi

# ---------------------------------------------------------------------------
# Step 2: Filter to only those with a failed cherry-pick comment
# ---------------------------------------------------------------------------
echo ""
echo "Step 2: Checking each PR for failed cherry-pick comments ..."

FAILED_PRS=()
FAILED_TITLES=()

while IFS= read -r line; do
  pr_number=$(echo "$line" | jq -r '.number')
  pr_title=$(echo "$line" | jq -r '.title')

  # Fetch comments and look for the failure marker
  # Both old ("Please backport manually") and new ("Dispatching ClaudeBox") variants
  # share the prefix "❌ Failed to cherry-pick"
  has_failure=$(gh api "repos/$REPO/issues/$pr_number/comments" \
    --paginate \
    --jq '.[].body' 2>/dev/null \
    | grep -c "❌ Failed to cherry-pick" || true)

  if [[ "$has_failure" -gt 0 ]]; then
    FAILED_PRS+=("$pr_number")
    FAILED_TITLES+=("$pr_title")
    echo "  #$pr_number - FAILED - $pr_title"
  fi
done < <(echo "$ALL_PRS" | jq -c '.[]')

echo ""
echo "  ${#FAILED_PRS[@]} PRs had failed cherry-picks out of $TOTAL_COUNT total."

if [[ ${#FAILED_PRS[@]} -eq 0 ]]; then
  echo "No failed backports found. All clean!"
  exit 0
fi

# ---------------------------------------------------------------------------
# Step 3: Gather backported PR numbers from staging PRs and staging branch
# ---------------------------------------------------------------------------
echo ""
echo "Step 3: Checking staging branch ($STAGING_BRANCH -> $TARGET_BRANCH) for backported commits ..."

BACKPORTED_PR_NUMS=()

# 3a: Get commits from staging PRs (open and merged)
STAGING_PRS=$(gh pr list --repo "$REPO" \
  --base "$TARGET_BRANCH" \
  --head "$STAGING_BRANCH" \
  --state all \
  --json number \
  --limit 50)

STAGING_PR_COUNT=$(echo "$STAGING_PRS" | jq 'length')
echo "  Found $STAGING_PR_COUNT staging PR(s)."

for staging_pr in $(echo "$STAGING_PRS" | jq -r '.[].number'); do
  echo "  Fetching commits from staging PR #$staging_pr ..."

  # gh api paginates at 30 commits per page by default
  COMMIT_MESSAGES=$(gh api "repos/$REPO/pulls/$staging_pr/commits" \
    --paginate \
    --jq '.[].commit.message' 2>/dev/null || true)

  # Extract PR numbers from commit messages: look for (#XXXX) pattern
  while IFS= read -r pr_ref; do
    if [[ -n "$pr_ref" ]]; then
      BACKPORTED_PR_NUMS+=("$pr_ref")
    fi
  done < <(echo "$COMMIT_MESSAGES" | grep -oP '\(#\K[0-9]+(?=\))' | sort -u)
done

# 3b: Also check commits on the staging branch directly (covers commits not yet in a PR)
echo "  Checking branch commits via compare API ($TARGET_BRANCH...$STAGING_BRANCH) ..."
BRANCH_COMMITS=$(gh api "repos/$REPO/compare/${TARGET_BRANCH}...${STAGING_BRANCH}" \
  --jq '.commits[].commit.message' 2>/dev/null || true)

if [[ -n "$BRANCH_COMMITS" ]]; then
  while IFS= read -r pr_ref; do
    if [[ -n "$pr_ref" ]]; then
      BACKPORTED_PR_NUMS+=("$pr_ref")
    fi
  done < <(echo "$BRANCH_COMMITS" | grep -oP '\(#\K[0-9]+(?=\))' | sort -u)
fi

# Deduplicate
BACKPORTED_PR_NUMS=($(printf '%s\n' "${BACKPORTED_PR_NUMS[@]}" | sort -u))

echo "  Found ${#BACKPORTED_PR_NUMS[@]} unique PR references in staging commits."

# ---------------------------------------------------------------------------
# Step 4: Cross-reference and produce report
# ---------------------------------------------------------------------------
echo ""
echo "=============================================="
echo "  BACKPORT STATUS REPORT (since $SINCE)"
echo "=============================================="
echo ""

RESOLVED=()
RESOLVED_TITLES=()
MISSING=()
MISSING_TITLES=()

for i in "${!FAILED_PRS[@]}"; do
  pr_num="${FAILED_PRS[$i]}"
  pr_title="${FAILED_TITLES[$i]}"

  found=0
  for backported in "${BACKPORTED_PR_NUMS[@]}"; do
    if [[ "$backported" == "$pr_num" ]]; then
      found=1
      break
    fi
  done

  if [[ "$found" -eq 1 ]]; then
    RESOLVED+=("$pr_num")
    RESOLVED_TITLES+=("$pr_title")
  else
    MISSING+=("$pr_num")
    MISSING_TITLES+=("$pr_title")
  fi
done

if [[ ${#RESOLVED[@]} -gt 0 ]]; then
  echo "RESOLVED (${#RESOLVED[@]}):"
  echo "---"
  for i in "${!RESOLVED[@]}"; do
    echo "  ✅ #${RESOLVED[$i]} - ${RESOLVED_TITLES[$i]}"
    echo "     https://github.com/$REPO/pull/${RESOLVED[$i]}"
  done
  echo ""
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "MISSING (${#MISSING[@]}):"
  echo "---"
  for i in "${!MISSING[@]}"; do
    echo "  ❌ #${MISSING[$i]} - ${MISSING_TITLES[$i]}"
    echo "     https://github.com/$REPO/pull/${MISSING[$i]}"
  done
  echo ""
else
  echo "🎉 All failed backports have been resolved!"
  echo ""
fi

echo "=============================================="
echo "Summary: ${#FAILED_PRS[@]} failed, ${#RESOLVED[@]} resolved, ${#MISSING[@]} missing"
echo "=============================================="
