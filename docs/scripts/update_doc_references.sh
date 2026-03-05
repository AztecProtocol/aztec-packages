#!/usr/bin/env bash
set -euo pipefail

# update_doc_references.sh - Dispatch ClaudeBox when referenced source files change
#
# This script:
# 1. Extracts all 'references' fields from documentation markdown frontmatter
# 2. Checks if any referenced files were changed in the current PR
# 3. Dispatches the ClaudeBox workflow to analyze changes and update docs
#
# Usage: ./update_doc_references.sh [pr_number] [docs_dir]
#
# Environment:
#   GITHUB_HEAD_REF - PR branch name (set by GitHub Actions)
#   GH_TOKEN - GitHub token for gh CLI (set by GitHub Actions)
#   SLACK_BOT_TOKEN - Slack bot token for notifications
#   SLACK_DOC_UPDATE_CHANNEL - Slack channel for notifications (default: #devrel-docs-updates)
#   CI - Set to 1 in CI environment
#   DRY_RUN - Set to 1 to skip dispatch (for testing)
#   LOCAL_TEST - Set to 1 to enable local testing mode

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT=$(git rev-parse --show-toplevel)

# Source shared libraries
source "$SCRIPT_DIR/lib/extract_doc_references.sh"

# Cleanup function for temp files
TEMP_FILES=()
cleanup() {
  for f in "${TEMP_FILES[@]}"; do
    rm -f "$f"
  done
}
trap cleanup EXIT

# Check for local testing mode
LOCAL_TEST="${LOCAL_TEST:-0}"
DRY_RUN="${DRY_RUN:-0}"

if [[ "${CI:-0}" != "1" ]] && [[ "$LOCAL_TEST" != "1" ]]; then
  echo "Not running in CI environment. Skipping automatic doc updates."
  echo ""
  echo "To test locally, run:"
  echo "  LOCAL_TEST=1 DRY_RUN=1 ./scripts/update_doc_references.sh <pr_number>"
  echo ""
  echo "Options:"
  echo "  LOCAL_TEST=1  - Enable local testing mode"
  echo "  DRY_RUN=1     - Skip dispatch (just show what would be dispatched)"
  echo "  pr_number     - The PR number to analyze"
  exit 0
fi

if [[ "$LOCAL_TEST" == "1" ]]; then
  echo "Running in LOCAL_TEST mode..."
  DRY_RUN="${DRY_RUN:-1}"
fi

cd "$REPO_ROOT"

# Parse arguments
PR_NUMBER_ARG=""
DOCS_DIR="docs"

if [[ $# -ge 1 ]] && [[ "$1" =~ ^[0-9]+$ ]]; then
  PR_NUMBER_ARG="$1"
  DOCS_DIR="${2:-docs}"
elif [[ $# -ge 1 ]]; then
  DOCS_DIR="$1"
fi

# Check required tools
for tool in gh jq; do
  if ! command -v "$tool" &> /dev/null; then
    echo "$tool not found. Skipping automatic doc updates."
    exit 0
  fi
done

# Check for Slack token (required unless DRY_RUN)
if [[ -z "${SLACK_BOT_TOKEN:-}" ]] && [[ "$DRY_RUN" != "1" ]]; then
  echo "SLACK_BOT_TOKEN not set. Skipping Slack notification."
  echo "Set DRY_RUN=1 to test without Slack."
  exit 0
fi

# Get the PR number from various sources
PR_NUMBER=""
BRANCH="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")}"

if [[ -n "$PR_NUMBER_ARG" ]]; then
  PR_NUMBER="$PR_NUMBER_ARG"
  echo "Using provided PR #$PR_NUMBER"
elif [[ -n "$BRANCH" ]] && [[ "$BRANCH" != "HEAD" ]]; then
  PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null || echo "")
  [[ -n "$PR_NUMBER" ]] && echo "Detected PR #$PR_NUMBER from branch $BRANCH"
fi

if [[ -z "$PR_NUMBER" ]]; then
  echo "Not in a PR context. Skipping automatic doc updates."
  exit 0
fi

echo "Checking for documentation updates needed for PR #$PR_NUMBER..."

# Check if PR is draft - skip for drafts
IS_DRAFT=$(gh pr view "$PR_NUMBER" --json isDraft -q .isDraft 2>/dev/null || echo "true")
if [[ "$IS_DRAFT" == "true" ]]; then
  echo "PR #$PR_NUMBER is a draft. Skipping automatic doc updates."
  exit 0
fi

# Get PR details for later use
PR_TITLE=$(gh pr view "$PR_NUMBER" --json title -q .title 2>/dev/null || echo "")
PR_URL=$(gh pr view "$PR_NUMBER" --json url -q .url 2>/dev/null || echo "")
PR_AUTHOR=$(gh pr view "$PR_NUMBER" --json author -q .author.login 2>/dev/null || echo "")
BASE_BRANCH=$(gh pr view "$PR_NUMBER" --json baseRefName -q .baseRefName 2>/dev/null || echo "")

echo "PR Title: $PR_TITLE"
echo "PR URL: $PR_URL"

# Extract all reference file paths from markdown frontmatter
echo "Extracting references from markdown files in $DOCS_DIR..."

MAPPING_FILE=$(mktemp)
TEMP_FILES+=("$MAPPING_FILE")

extract_references_mapping "$DOCS_DIR" "$MAPPING_FILE"

REFERENCE_FILES=$(get_unique_references "$MAPPING_FILE")

if [[ -z "$REFERENCE_FILES" ]]; then
  echo "No reference files found in documentation frontmatter."
  exit 0
fi

REF_COUNT=$(echo "$REFERENCE_FILES" | wc -l | tr -d ' ')
echo "Found $REF_COUNT unique referenced file(s)."

# Get the base branch
if [[ -z "$BASE_BRANCH" ]]; then
  echo "Could not determine PR base branch. Skipping automatic doc updates."
  exit 0
fi
echo "PR base branch: $BASE_BRANCH"

# Fetch and find merge-base
echo "Fetching git history..."
git fetch --deepen=100 2>/dev/null || true

if ! git fetch --depth=100 origin "$BASE_BRANCH" 2>/dev/null; then
  echo "Failed to fetch origin/$BASE_BRANCH. Skipping automatic doc updates."
  exit 0
fi

MERGE_BASE=$(git merge-base HEAD "origin/$BASE_BRANCH" 2>/dev/null || echo "")
if [[ -z "$MERGE_BASE" ]]; then
  git fetch --unshallow 2>/dev/null || true
  MERGE_BASE=$(git merge-base HEAD "origin/$BASE_BRANCH" 2>/dev/null || echo "")
  if [[ -z "$MERGE_BASE" ]]; then
    echo "Could not determine merge-base. Skipping automatic doc updates."
    exit 0
  fi
fi
echo "Merge-base: $MERGE_BASE"

# Get changed files - use different methods for CI vs local testing
if [[ "$LOCAL_TEST" == "1" ]]; then
  echo "Fetching changed files from PR #$PR_NUMBER via GitHub API..."
  CHANGED_FILES=$(gh pr view "$PR_NUMBER" --json files --jq '.files[].path' 2>/dev/null || echo "")
else
  CHANGED_FILES=$(git diff --name-only "$MERGE_BASE"...HEAD 2>/dev/null || echo "")
fi

if [[ -z "$CHANGED_FILES" ]]; then
  echo "No changed files detected in PR. Skipping automatic doc updates."
  exit 0
fi
echo "Found $(echo "$CHANGED_FILES" | wc -l | tr -d ' ') changed file(s) in PR."

# Build mappings of changed files to docs
build_change_mappings "$MAPPING_FILE" "$CHANGED_FILES"

if [[ -z "$CHANGED_REFERENCES" ]] || [[ "$CHANGED_REFERENCES" == "\n" ]]; then
  echo "No referenced files were changed in this PR. Skipping automatic doc updates."
  exit 0
fi

echo ""
echo "The following referenced files were changed in this PR:"
echo -e "$CHANGED_REFERENCES"
echo ""

# Get unique docs that need updating
DOCS_TO_UPDATE=$(for doc in "${!DOC_TO_FILES_MAP[@]}"; do echo "$doc"; done | sort -u)
DOC_COUNT=$(echo "$DOCS_TO_UPDATE" | grep -v '^$' | wc -l | tr -d ' ')

echo "Found $DOC_COUNT documentation file(s) that may need updates."

if [[ "$DOC_COUNT" -eq 0 ]]; then
  echo "No documentation files need updating."
  exit 0
fi

# Build a summary of changed references for the prompt
CHANGED_SUMMARY=""
for ref_file in "${!FILE_TO_DOCS_MAP[@]}"; do
  IFS='|' read -ra DOCS <<< "${FILE_TO_DOCS_MAP[$ref_file]}"
  DOC_LIST=$(printf ", %s" "${DOCS[@]}")
  DOC_LIST="${DOC_LIST:2}" # strip leading ", "
  CHANGED_SUMMARY="${CHANGED_SUMMARY}${ref_file} -> ${DOC_LIST}; "
done
# Strip trailing "; "
CHANGED_SUMMARY="${CHANGED_SUMMARY%%; }"

SLACK_CHANNEL="${SLACK_DOC_UPDATE_CHANNEL:-devrel-docs-updates}"

if [[ "$DRY_RUN" == "1" ]]; then
  echo ""
  echo "=== DRY_RUN: Would dispatch ClaudeBox ==="
  echo ""
  echo "Slack channel: $SLACK_CHANNEL"
  echo "PR: #$PR_NUMBER ($PR_TITLE)"
  echo "Changed references: $CHANGED_SUMMARY"
  echo ""
  echo "gh workflow run claudebox.yml \\"
  echo "  -f prompt=\"PR #$PR_NUMBER ($PR_TITLE) changed source files referenced by documentation. Analyze the changes and update the affected documentation. Changed references: $CHANGED_SUMMARY. Follow the update-doc-references skill (.claude/skills/update-doc-references/SKILL.md).\" \\"
  echo "  -f link=\"<SLACK_PERMALINK>\""
  echo ""
  echo "=== End of DRY_RUN ==="
  exit 0
fi

# Post Slack message and capture timestamp for permalink
echo "Posting Slack notification to $SLACK_CHANNEL..."

SLACK_TEXT=$(printf ':books: Source files referenced by docs changed in <%s|PR #%s>. Dispatching ClaudeBox to analyze.\n\n*Changed references:*\n%s' \
  "$PR_URL" "$PR_NUMBER" "$(for ref_file in "${!FILE_TO_DOCS_MAP[@]}"; do
    IFS='|' read -ra DOCS <<< "${FILE_TO_DOCS_MAP[$ref_file]}"
    printf '• \x60%s\x60 → ' "$ref_file"
    printf '\x60%s\x60, ' "${DOCS[@]}" | sed 's/, $//'
    echo ""
  done)")

RESP=$(curl -sS -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-type: application/json" \
  -d "$(jq -n --arg c "$SLACK_CHANNEL" --arg t "$SLACK_TEXT" '{channel:$c, text:$t}')")
echo "Slack response: $RESP"

TS=$(echo "$RESP" | jq -r '.ts // empty')
CHANNEL_ID=$(echo "$RESP" | jq -r '.channel // empty')

LINK=""
if [[ -n "$TS" && -n "$CHANNEL_ID" ]]; then
  LINK="https://aztecprotocol.slack.com/archives/$CHANNEL_ID/p${TS//./}"
fi

# Dispatch ClaudeBox
echo "Dispatching ClaudeBox workflow..."

gh workflow run claudebox.yml \
  -f prompt="PR #$PR_NUMBER ($PR_TITLE) changed source files referenced by documentation. Analyze the changes and update the affected documentation. Changed references: $CHANGED_SUMMARY. Follow the update-doc-references skill (.claude/skills/update-doc-references/SKILL.md)." \
  -f link="${LINK:-$PR_URL}"

echo ""
echo "Done! ClaudeBox has been dispatched to analyze documentation updates for PR #$PR_NUMBER."
