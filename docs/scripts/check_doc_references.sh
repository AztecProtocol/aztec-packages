#!/usr/bin/env bash
set -euo pipefail

# check_doc_references - Request devrel review when referenced source files change
#
# This script:
# 1. Extracts all 'references' fields from documentation markdown frontmatter
# 2. Checks if any referenced files were changed in the current PR
# 3. Requests AztecProtocol/devrel team as reviewers if files changed and PR is not draft
# 4. Skips if devrel team is already requested as a reviewer
#
# Usage: check_doc_references.sh [pr_number] [docs_dir]
#
# Arguments:
#   pr_number - (Optional) PR number. If not provided, will attempt auto-detection
#   docs_dir  - (Optional) Documentation directory. Default: docs
#
# Environment:
#   GITHUB_REF - May contain PR number in format refs/pull/123/merge
#   GITHUB_BASE_REF - Base branch name (set by GitHub Actions)
#   GITHUB_TOKEN - GitHub token for gh CLI (set by GitHub Actions)
#   CI - Set to 1 in CI environment

# Only run in CI environment to avoid accidental local execution
if [[ "${CI:-0}" != "1" ]]; then
  echo "Not running in CI environment. Skipping devrel review check."
  exit 0
fi


REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Parse arguments
PR_NUMBER_ARG=""
DOCS_DIR="docs"

if [[ $# -ge 1 ]] && [[ "$1" =~ ^[0-9]+$ ]]; then
  # First arg is a number, treat as PR number
  PR_NUMBER_ARG="$1"
  DOCS_DIR="${2:-docs}"
elif [[ $# -ge 1 ]]; then
  # First arg is not a number, treat as docs dir
  DOCS_DIR="$1"
fi

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
  echo "gh CLI not found. Skipping devrel review check."
  exit 0
fi

# Get the PR number from various sources
PR_NUMBER=""
BRANCH="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")}"

# Method 1: Use provided argument if available
if [[ -n "$PR_NUMBER_ARG" ]]; then
  PR_NUMBER="$PR_NUMBER_ARG"
  echo "Using provided PR #$PR_NUMBER"
# Method 2: Use branch to find PR (same pattern as ci.sh)
elif [[ -n "$BRANCH" ]] && [[ "$BRANCH" != "HEAD" ]]; then
  PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null || echo "")
  [[ -n "$PR_NUMBER" ]] && echo "Detected PR #$PR_NUMBER from branch $BRANCH"
fi

if [[ -z "$PR_NUMBER" ]]; then
  echo "Not in a PR context. Skipping devrel review check."
  exit 0
fi

echo "Checking doc references for PR #$PR_NUMBER..."

# Check if PR is draft
IS_DRAFT=$(gh pr view "$PR_NUMBER" --json isDraft -q .isDraft 2>/dev/null || echo "true")
if [[ "$IS_DRAFT" == "true" ]]; then
  echo "PR #$PR_NUMBER is a draft. Skipping devrel review request."
  exit 0
fi

# Check if AztecProtocol/devrel team is already a requested reviewer
echo "Checking if devrel team is already a requested reviewer..."

# Get full review requests data for debugging
REVIEW_REQUESTS_JSON=$(gh pr view "$PR_NUMBER" --json reviewRequests 2>/dev/null || echo "")

# Extract both team slugs and user logins
REQUESTED_TEAMS=$(echo "$REVIEW_REQUESTS_JSON" | jq -r '.reviewRequests[]? | select(.slug != null) | .slug' 2>/dev/null || echo "")
REQUESTED_USERS=$(echo "$REVIEW_REQUESTS_JSON" | jq -r '.reviewRequests[]? | select(.login != null) | .login' 2>/dev/null || echo "")

echo "Requested teams: ${REQUESTED_TEAMS:-none}"
echo "Requested users: ${REQUESTED_USERS:-none}"

# Check if devrel team is in the requested teams
if [[ -n "$REQUESTED_TEAMS" ]] && echo "$REQUESTED_TEAMS" | grep -q "devrel"; then
  echo "AztecProtocol/devrel team is already a requested reviewer for PR #$PR_NUMBER. Skipping."
  exit 0
fi

# Check if any devrel team member has already approved
# Note: GitHub's onBehalfOf field is broken, so we check team membership directly
echo "Checking if devrel team member has already approved..."
DEVREL_MEMBERS=$(gh api orgs/AztecProtocol/teams/devrel/members --jq '.[].login' 2>/dev/null || echo "")
if [[ -n "$DEVREL_MEMBERS" ]]; then
  APPROVERS=$(gh pr view "$PR_NUMBER" --json reviews -q '.reviews[] | select(.state == "APPROVED") | .author.login' 2>/dev/null || echo "")
  if [[ -n "$APPROVERS" ]]; then
    while IFS= read -r approver; do
      if echo "$DEVREL_MEMBERS" | grep -qx "$approver"; then
        echo "PR #$PR_NUMBER already approved by devrel team member: $approver. Skipping team review request."
        exit 0
      fi
    done <<< "$APPROVERS"
  fi
fi

# Extract all reference file paths from markdown frontmatter
# Expected format: references: ["path/from/repo/root/file.ts", "another/file.ts"]
# Paths should be absolute from repository root (not relative with ../)
echo "Extracting references from markdown files in $DOCS_DIR..."
REFERENCE_FILES=$(
  find "$DOCS_DIR" -type f -name "*.md" -exec awk '
    BEGIN { in_frontmatter = 0 }
    /^---$/ {
      if (NR == 1) {
        in_frontmatter = 1
      } else if (in_frontmatter) {
        in_frontmatter = 0
      }
      next
    }
    in_frontmatter && /^references:/ {
      # Extract array: references: ["file1", "file2"]
      if (match($0, /\[.*\]/)) {
        refs = substr($0, RSTART, RLENGTH)
        gsub(/[\[\]"'\'']/, "", refs)
        split(refs, arr, /,[ ]*/)
        for (i in arr) {
          if (arr[i] != "") {
            print arr[i]
          }
        }
      }
    }
  ' {} \; | sort -u
)

if [[ -z "$REFERENCE_FILES" ]]; then
  echo "No reference files found in documentation frontmatter."
  exit 0
fi

REF_COUNT=$(echo "$REFERENCE_FILES" | wc -l)
echo "Found $REF_COUNT unique referenced file(s)."

# Get the base branch from the PR
echo "Fetching PR base branch..."
BASE_BRANCH=$(gh pr view "$PR_NUMBER" --json baseRefName -q .baseRefName 2>/dev/null || echo "")
if [[ -z "$BASE_BRANCH" ]]; then
  echo "Could not determine PR base branch. Skipping devrel review check."
  exit 0
fi
echo "PR base branch: $BASE_BRANCH"

# Deepen the current branch history to find merge-base (same pattern as squash-pr.sh)
echo "Deepening git history..."
git fetch --deepen=100 2>/dev/null || true

# Fetch the base branch with depth to ensure we have enough history
echo "Fetching origin/$BASE_BRANCH with depth..."
if ! git fetch --depth=100 origin "$BASE_BRANCH" 2>/dev/null; then
  echo "Failed to fetch origin/$BASE_BRANCH. Skipping devrel review check."
  exit 0
fi

# Find the merge-base (the commit where this branch diverged from base)
MERGE_BASE=$(git merge-base HEAD "origin/$BASE_BRANCH" 2>/dev/null || echo "")
if [[ -z "$MERGE_BASE" ]]; then
  # If still can't find merge-base, try with unshallow (last resort)
  echo "Could not find merge-base, attempting unshallow..."
  git fetch --unshallow 2>/dev/null || true
  MERGE_BASE=$(git merge-base HEAD "origin/$BASE_BRANCH" 2>/dev/null || echo "")

  if [[ -z "$MERGE_BASE" ]]; then
    echo "Could not determine merge-base even after unshallow. Skipping devrel review check."
    exit 0
  fi
fi
echo "Merge-base: $MERGE_BASE"

# Get changed files since the merge-base
CHANGED_FILES=$(git diff --name-only "$MERGE_BASE"...HEAD 2>/dev/null || echo "")
if [[ -z "$CHANGED_FILES" ]]; then
  echo "No changed files detected in PR. Skipping devrel review check."
  exit 0
fi
echo "Found $(echo "$CHANGED_FILES" | wc -l) changed file(s) in PR."

# Check if any referenced files were changed
# Reference paths are absolute from repo root, so we can compare directly
CHANGED_REFERENCES=""
while IFS= read -r ref_file; do
  if echo "$CHANGED_FILES" | grep -qF "$ref_file"; then
    CHANGED_REFERENCES="${CHANGED_REFERENCES}${ref_file}\n"
  fi
done <<< "$REFERENCE_FILES"

if [[ -z "$CHANGED_REFERENCES" ]] || [[ "$CHANGED_REFERENCES" == "\n" ]]; then
  echo "No referenced files were changed in this PR. Skipping devrel review request."
  exit 0
fi

echo ""
echo "The following referenced files were changed in this PR:"
echo -e "$CHANGED_REFERENCES"
echo ""
echo "Requesting AztecProtocol/devrel team as a reviewer for PR #$PR_NUMBER..."

# Request AztecProtocol/devrel team as a reviewer
if gh pr edit "$PR_NUMBER" --add-reviewer AztecProtocol/devrel 2>/dev/null; then
  echo "✓ Successfully requested AztecProtocol/devrel team as a reviewer."
else
  echo "⚠ Failed to request AztecProtocol/devrel team as a reviewer. They may need to be added manually."

  # Add a PR comment to notify about the failure
  COMMENT_BODY="⚠️ **Documentation Reference Check**

Failed to automatically request @AztecProtocol/devrel as reviewers.

**Referenced files changed:**
$(echo -e "$CHANGED_REFERENCES" | sed 's/^/- /')

Please manually request @AztecProtocol/devrel as reviewers for this PR."

  gh pr comment "$PR_NUMBER" --body "$COMMENT_BODY" 2>/dev/null || echo "Note: Could not add PR comment."

  # Don't block the build
  exit 0
fi
