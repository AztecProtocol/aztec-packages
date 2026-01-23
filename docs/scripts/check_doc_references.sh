#!/usr/bin/env bash
set -euo pipefail

# check_doc_references - Request devrel review when referenced source files change
#
# This script:
# 1. Extracts all 'references' fields from documentation markdown frontmatter
# 2. Checks if any referenced files were changed in the current PR
# 3. Requests AztecProtocol/devrel team as reviewers if files changed and PR is not draft
# 4. Adds a comprehensive PR comment showing which changed files are referenced by which docs
# 5. Skips reviewer request if devrel team is already requested or a member has approved
#
# Usage: check_doc_references.sh [pr_number] [docs_dir]
#
# Arguments:
#   pr_number - (Optional) PR number. If not provided, will attempt auto-detection
#   docs_dir  - (Optional) Documentation directory. Default: docs
#
# Reference Format:
#   - Individual files: "yarn-project/stdlib/src/interfaces/aztec-node.ts"
#   - Directories (all files within): "noir-projects/aztec-nr/aztec/src/context/*"
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
# Also create a mapping of source files to documentation files
# Note: We only scan docs/docs/ (current docs), not versioned_docs/
# Versioned docs are historical snapshots and should not be modified when references change
echo "Extracting references from markdown files in $DOCS_DIR/docs..."

# Create a temporary file to store the mapping
MAPPING_FILE=$(mktemp)
trap "rm -f $MAPPING_FILE" EXIT

find "$DOCS_DIR/docs" -type f -name "*.md" -print0 | while IFS= read -r -d '' doc_file; do
  awk -v doc="$doc_file" '
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
            # Output format: source_file|doc_file
            print arr[i] "|" doc
          }
        }
      }
    }
  ' "$doc_file"
done > "$MAPPING_FILE"
# Validate all referenced paths exist (can be files or directories)
# Directory references use /* suffix (e.g., "src/context/*" means all files in that directory)
echo "Validating referenced paths exist..."
MISSING_PATHS=""
while IFS='|' read -r ref_path doc_file; do
  # Strip /* suffix for directory references before checking existence
  check_path="${ref_path%/\*}"
  if [[ ! -e "$check_path" ]]; then
    MISSING_PATHS="${MISSING_PATHS}  - ${ref_path} (referenced in ${doc_file})\n"
  fi
done < "$MAPPING_FILE"

if [[ -n "$MISSING_PATHS" ]]; then
  echo ""
  echo "ERROR: The following referenced paths do not exist:"
  echo -e "$MISSING_PATHS"
  echo "Please update the 'references' frontmatter in the affected documentation files."
  exit 1
fi
# Extract unique referenced files
REFERENCE_FILES=$(cut -d'|' -f1 "$MAPPING_FILE" | sort -u)

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

# Check if any referenced files were changed and build mapping
# Reference paths are absolute from repo root, so we can compare directly
# Directory references use /* suffix - strip it for matching (e.g., "src/context/*" matches "src/context/file.nr")
CHANGED_REFERENCES=""
declare -A FILE_TO_DOCS_MAP

while IFS= read -r ref_file; do
  # Strip /* suffix for directory references before matching
  match_pattern="${ref_file%/\*}"
  if echo "$CHANGED_FILES" | grep -qF "$match_pattern"; then
    CHANGED_REFERENCES="${CHANGED_REFERENCES}${ref_file}\n"

    # Find all docs that reference this changed file
    while IFS='|' read -r src_file doc_file; do
      if [[ "$src_file" == "$ref_file" ]]; then
        # Store in associative array (append to existing value if key exists)
        if [[ -n "${FILE_TO_DOCS_MAP[$ref_file]}" ]]; then
          FILE_TO_DOCS_MAP[$ref_file]="${FILE_TO_DOCS_MAP[$ref_file]}|${doc_file}"
        else
          FILE_TO_DOCS_MAP[$ref_file]="$doc_file"
        fi
      fi
    done < "$MAPPING_FILE"
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

# Build comprehensive PR comment with file-to-docs mapping
COMMENT_BODY="📚 **Documentation References Updated**

The following source files that changed in this PR are referenced by documentation:

### Changed Files → Documentation
"

# Get unique doc files count
ALL_DOCS=""
CHANGED_FILE_COUNT=0

# Sort the keys for consistent output
SORTED_KEYS=$(for key in "${!FILE_TO_DOCS_MAP[@]}"; do echo "$key"; done | sort)

while IFS= read -r changed_file; do
  [[ -z "$changed_file" ]] && continue
  CHANGED_FILE_COUNT=$((CHANGED_FILE_COUNT + 1))

  COMMENT_BODY="${COMMENT_BODY}
**\`${changed_file}\`**"

  # Get docs for this file and split by pipe
  docs="${FILE_TO_DOCS_MAP[$changed_file]}"

  # Convert pipe-separated list to array and iterate
  IFS='|' read -ra DOC_ARRAY <<< "$docs"
  for doc_file in "${DOC_ARRAY[@]}"; do
    COMMENT_BODY="${COMMENT_BODY}
- 📄 \`${doc_file}\`"

    # Track all unique docs
    if ! echo "$ALL_DOCS" | grep -qF "$doc_file"; then
      ALL_DOCS="${ALL_DOCS}${doc_file}\n"
    fi
  done
done <<< "$SORTED_KEYS"

# Count unique docs
DOC_FILE_COUNT=$(echo -e "$ALL_DOCS" | grep -v '^$' | sort -u | wc -l)

COMMENT_BODY="${COMMENT_BODY}

---
**Summary:** ${CHANGED_FILE_COUNT} changed file(s) referenced by ${DOC_FILE_COUNT} documentation file(s)

@AztecProtocol/devrel team has been requested for review."

echo "Requesting AztecProtocol/devrel team as a reviewer for PR #$PR_NUMBER..."

# Request AztecProtocol/devrel team as a reviewer
REVIEWER_REQUESTED=false
if gh pr edit "$PR_NUMBER" --add-reviewer AztecProtocol/devrel 2>/dev/null; then
  echo "✓ Successfully requested AztecProtocol/devrel team as a reviewer."
  REVIEWER_REQUESTED=true
else
  echo "⚠ Failed to request AztecProtocol/devrel team as a reviewer. They may need to be added manually."

  # Update comment to reflect failure
  COMMENT_BODY="⚠️ ${COMMENT_BODY}

**Note:** Failed to automatically add @AztecProtocol/devrel as reviewers. Please add them manually."
fi

# Check if we've already posted a documentation reference comment
echo "Checking for existing documentation reference comment..."
EXISTING_COMMENT=$(gh pr view "$PR_NUMBER" --json comments --jq '.comments[] | select(.body | startswith("📚 **Documentation References Updated**")) | .id' 2>/dev/null | head -n 1 || echo "")

if [[ -n "$EXISTING_COMMENT" ]]; then
  echo "Found existing documentation reference comment (ID: $EXISTING_COMMENT). Updating it..."
  if gh api "repos/{owner}/{repo}/issues/comments/$EXISTING_COMMENT" -X PATCH -f body="$COMMENT_BODY" 2>/dev/null; then
    echo "✓ Successfully updated existing documentation reference comment."
  else
    echo "⚠ Failed to update existing comment. Will try to add new comment instead."
    if gh pr comment "$PR_NUMBER" --body "$COMMENT_BODY" 2>/dev/null; then
      echo "✓ Successfully added new documentation reference comment."
    else
      echo "⚠ Failed to add PR comment."
    fi
  fi
else
  echo "No existing documentation reference comment found. Adding new comment..."
  if gh pr comment "$PR_NUMBER" --body "$COMMENT_BODY" 2>/dev/null; then
    echo "✓ Successfully added documentation reference comment."
  else
    echo "⚠ Failed to add PR comment."
  fi
fi

# Exit successfully even if comment fails (don't block builds)
exit 0
