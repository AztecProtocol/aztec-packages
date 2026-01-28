#!/usr/bin/env bash
set -euo pipefail

# update_doc_references.sh - Automatically update documentation when referenced source files change
#
# This script:
# 1. Extracts all 'references' fields from documentation markdown frontmatter
# 2. Checks if any referenced files were changed in the current PR
# 3. Uses Claude Code to analyze changes and make actual documentation edits
# 4. Sends the resulting diff to Slack for devrel review
#
# Usage: ./update_doc_references.sh [pr_number] [docs_dir]
#
# Environment:
#   GITHUB_HEAD_REF - PR branch name (set by GitHub Actions)
#   GITHUB_TOKEN - GitHub token for gh CLI
#   ANTHROPIC_API_KEY - API key for Claude (required for doc updates)
#   SLACK_BOT_TOKEN - Slack bot token for notifications
#   SLACK_DOC_UPDATE_CHANNEL - Slack channel for notifications (default: #devrel)
#   CI - Set to 1 in CI environment
#   DRY_RUN - Set to 1 to skip Slack notification (for testing)
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
  echo "  DRY_RUN=1     - Skip Slack notification (just show the diff)"
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

if ! command -v claude &> /dev/null; then
  echo "Claude Code CLI not found. Skipping automatic doc updates."
  echo "Install with: npm install -g @anthropic-ai/claude-code"
  exit 0
fi

# Check for Anthropic API key (required in CI, optional in LOCAL_TEST mode)
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  if [[ "$LOCAL_TEST" != "1" ]]; then
    echo "ANTHROPIC_API_KEY not set. Skipping automatic doc updates."
    exit 0
  else
    echo "Note: ANTHROPIC_API_KEY not set, but LOCAL_TEST mode - Claude CLI will use its own auth."
  fi
fi

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

# Prepare context for Claude
CONTEXT_FILE=$(mktemp)
TEMP_FILES+=("$CONTEXT_FILE")

cat > "$CONTEXT_FILE" << 'CONTEXT_HEADER'
You are reviewing code changes and updating documentation accordingly.

For each documentation file that references changed source code, analyze:
1. What changed in the referenced source files
2. Whether those changes require documentation updates
3. If updates are needed, make precise edits to the documentation

Guidelines:
- Only update documentation where the code changes actually affect it
- Keep updates minimal and focused
- Preserve the existing documentation style and format
- Do not add new sections unless absolutely necessary
- If code examples in the documentation need updating due to API changes, update them
- If concepts or explanations are now incorrect due to code changes, correct them
- Do not make cosmetic changes unrelated to the code changes

CONTEXT_HEADER

# Add the PR context
cat >> "$CONTEXT_FILE" << EOF

## Original PR Information
- PR Number: #$PR_NUMBER
- PR Title: $PR_TITLE
- PR URL: $PR_URL
- PR Author: $PR_AUTHOR

## Changed Source Files and Their Documentation References:

EOF

# Add file mappings
for ref_file in "${!FILE_TO_DOCS_MAP[@]}"; do
  echo "### Source: \`$ref_file\`" >> "$CONTEXT_FILE"
  echo "Referenced by:" >> "$CONTEXT_FILE"
  IFS='|' read -ra DOCS <<< "${FILE_TO_DOCS_MAP[$ref_file]}"
  for doc in "${DOCS[@]}"; do
    echo "- \`$doc\`" >> "$CONTEXT_FILE"
  done
  echo "" >> "$CONTEXT_FILE"
done

# Add the diffs
echo "## Code Changes (Diffs):" >> "$CONTEXT_FILE"
echo "" >> "$CONTEXT_FILE"

for ref_file in "${!FILE_TO_DOCS_MAP[@]}"; do
  match_pattern="${ref_file%/\*}"

  # Get the actual changed files matching this reference
  MATCHING_CHANGED=$(echo "$CHANGED_FILES" | grep -F "$match_pattern" || true)

  if [[ -n "$MATCHING_CHANGED" ]]; then
    echo "### Changes in \`$ref_file\`:" >> "$CONTEXT_FILE"
    echo '```diff' >> "$CONTEXT_FILE"

    while IFS= read -r changed_file; do
      if [[ -n "$changed_file" ]]; then
        git diff "$MERGE_BASE"...HEAD -- "$changed_file" 2>/dev/null >> "$CONTEXT_FILE" || true
      fi
    done <<< "$MATCHING_CHANGED"

    echo '```' >> "$CONTEXT_FILE"
    echo "" >> "$CONTEXT_FILE"
  fi
done

# Process each documentation file with Claude
UPDATES_MADE=0

echo ""
echo "Processing documentation files with Claude Code..."
echo ""

for doc_file in $DOCS_TO_UPDATE; do
  [[ -z "$doc_file" ]] && continue
  [[ ! -f "$doc_file" ]] && continue

  echo "Analyzing: $doc_file"

  # Get the referenced files for this doc
  ref_files="${DOC_TO_FILES_MAP[$doc_file]}"

  # Create a focused prompt for this specific doc
  DOC_PROMPT_FILE=$(mktemp)
  TEMP_FILES+=("$DOC_PROMPT_FILE")

  cat "$CONTEXT_FILE" > "$DOC_PROMPT_FILE"

  cat >> "$DOC_PROMPT_FILE" << EOF

## Task

Review the documentation file \`$doc_file\` and update it if the code changes above require documentation updates.

The documentation references these source files: $ref_files

Instructions:
1. Read the current documentation file
2. Analyze whether the code changes affect any content in this documentation
3. If updates are needed, use the Edit tool to make precise changes
4. Only make changes that are directly related to the code changes
5. If no changes are needed, simply report that the documentation is still accurate

Do NOT:
- Make cosmetic or style changes unrelated to the code changes
- Add new sections unless the code changes introduce new concepts
- Remove content unless it's now incorrect due to code changes
- Update version numbers or dates unless explicitly part of the code change

After analysis, respond with either:
- "NO_CHANGES_NEEDED" if the documentation is still accurate
- A summary of the changes you made if updates were applied
EOF

  # Run Claude Code to analyze and potentially update the doc
  # Using --print to get output and --dangerously-skip-permissions for CI
  CLAUDE_OUTPUT=$(claude --print --dangerously-skip-permissions \
    --max-turns 5 \
    -p "$(cat "$DOC_PROMPT_FILE")" 2>&1 || echo "CLAUDE_ERROR")

  rm -f "$DOC_PROMPT_FILE"

  if [[ "$CLAUDE_OUTPUT" == *"CLAUDE_ERROR"* ]]; then
    echo "  Warning: Claude Code encountered an error processing $doc_file"
    echo "  Error: $CLAUDE_OUTPUT"
    continue
  fi

  if [[ "$CLAUDE_OUTPUT" == *"NO_CHANGES_NEEDED"* ]]; then
    echo "  No changes needed for $doc_file"
  else
    echo "  Changes may have been applied to $doc_file"
    UPDATES_MADE=$((UPDATES_MADE + 1))
  fi
done

echo ""

# Check if any files were actually modified
MODIFIED_FILES=$(git diff --name-only 2>/dev/null || echo "")

if [[ -z "$MODIFIED_FILES" ]]; then
  echo "No documentation updates were made by Claude."
  exit 0
fi

echo "Modified files:"
echo "$MODIFIED_FILES"
echo ""

# Get the actual diff for the Slack message
DOC_DIFF=$(git diff 2>/dev/null || echo "")

# Truncate diff if too long for Slack (max ~3000 chars)
DOC_DIFF_DISPLAY="$DOC_DIFF"
if [[ ${#DOC_DIFF_DISPLAY} -gt 2800 ]]; then
  DOC_DIFF_DISPLAY="${DOC_DIFF_DISPLAY:0:2800}

... (truncated - see CI logs for full diff)"
fi

# Prepare Slack message
SLACK_CHANNEL="${SLACK_DOC_UPDATE_CHANNEL:-devrel-docs-updates}"

SLACK_MESSAGE=$(cat << EOF
:books: *Documentation Update Required*

A PR has changes to files referenced by documentation. Claude has analyzed the changes and made updates.

*Original PR:* <$PR_URL|#$PR_NUMBER - $PR_TITLE>
*Author:* @$PR_AUTHOR

*Modified Documentation Files:*
$(echo "$MODIFIED_FILES" | sed 's/.*$/• `&`/')

*Changes Made:*
\`\`\`diff
$DOC_DIFF_DISPLAY
\`\`\`

:point_right: *Please review these changes and apply them to the documentation.*
EOF
)

if [[ "$DRY_RUN" == "1" ]]; then
  echo ""
  echo "=== DRY_RUN: Would send to Slack channel $SLACK_CHANNEL ==="
  echo ""
  echo "$SLACK_MESSAGE"
  echo ""
  echo "=== End of Slack message ==="
  echo ""
  echo "=== Full diff that would be applied ==="
  echo "$DOC_DIFF"
  echo "=== End of diff ==="

  # Revert changes in DRY_RUN mode
  echo ""
  echo "Reverting changes (DRY_RUN mode)..."
  git checkout -- . 2>/dev/null || true
  exit 0
fi

echo "Sending Slack notification to $SLACK_CHANNEL..."

# Escape for JSON
SLACK_MESSAGE_ESCAPED=$(echo "$SLACK_MESSAGE" | jq -Rs .)

SLACK_PAYLOAD=$(cat << EOF
{
  "channel": "$SLACK_CHANNEL",
  "text": "Documentation update required for PR #$PR_NUMBER",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": $SLACK_MESSAGE_ESCAPED
      }
    }
  ]
}
EOF
)

SLACK_RESPONSE=$(curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-type: application/json" \
  --data "$SLACK_PAYLOAD")

if echo "$SLACK_RESPONSE" | jq -e '.ok == true' > /dev/null 2>&1; then
  echo "Slack notification sent successfully!"
else
  echo "Warning: Slack notification may have failed"
  echo "Response: $(echo "$SLACK_RESPONSE" | jq -r '.error // "unknown error"' 2>/dev/null || echo "$SLACK_RESPONSE")"
fi

# Revert changes after sending notification
# The actual changes should be applied by devrel after review
echo ""
echo "Reverting changes (changes were sent to Slack for review)..."
git checkout -- . 2>/dev/null || true

echo ""
echo "Done! Documentation changes have been sent to $SLACK_CHANNEL for review."
