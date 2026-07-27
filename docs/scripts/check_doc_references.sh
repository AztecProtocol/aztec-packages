#!/usr/bin/env bash
set -euo pipefail

# check_doc_references - Request devrel review and dispatch ClaudeBox when referenced source files change
#
# This script:
# 1. Extracts all 'references' fields from documentation markdown frontmatter
# 2. Checks if any referenced files were changed in the current PR
# 3. Requests AztecProtocol/devrel team as reviewers if files changed and PR is not draft
# 4. Sends a Slack message to #docs-alerts showing which changed files are referenced by which docs
# 5. Dispatches ClaudeBox to analyze changes and update documentation
# 6. Skips reviewer request if devrel team is already requested or a member has approved
#
# Usage: check_doc_references.sh [pr_number] [docs_dir]
#
# Arguments:
#   pr_number - (Optional) PR number. If not provided, will attempt auto-detection
#   docs_dir  - (Optional) Documentation directory. Default: docs
#
# Reference Format:
#   - Individual files: "yarn-project/stdlib/src/interfaces/aztec-node.ts"
#   - Directories (all files within): "noir-projects/labs/aztec-nr/aztec/src/context/*"
#
# Environment:
#   GITHUB_REF - May contain PR number in format refs/pull/123/merge
#   GITHUB_BASE_REF - Base branch name (set by GitHub Actions)
#   GITHUB_TOKEN - GitHub token for gh CLI (set by GitHub Actions)
#   AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN - Required for sending Slack messages (has #docs-alerts access)
#   CI - Set to 1 in CI environment

# Only run in CI environment to avoid accidental local execution
if [[ "${CI:-0}" != "1" ]]; then
  echo "Not running in CI environment. Skipping devrel review check."
  exit 0
fi

# Function to send Slack message
send_slack_message() {
  local message=$1
  if [[ -z "${AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN:-}" ]]; then
    echo "AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN not set, skipping Slack notification"
    return 0
  fi

  local data=$(cat <<EOF
{
  "channel": "#docs-alerts",
  "text": "$message"
}
EOF
)
  local response
  if ! response=$(curl -s --fail-with-body -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN" \
    -H "Content-type: application/json" \
    --data "$data"); then
    echo "Slack API request failed (curl error)" >&2
    return 1
  fi

  # Check if Slack API returned ok: true (Slack returns 200 even on errors)
  local ok
  if ! ok=$(echo "$response" | jq -r '.ok' 2>/dev/null); then
    echo "Slack API returned invalid JSON: $response" >&2
    return 1
  fi

  if [[ "$ok" != "true" ]]; then
    local error
    error=$(echo "$response" | jq -r '.error // "unknown error"' 2>/dev/null)
    echo "Slack API error: $error" >&2
    return 1
  fi

  return 0
}

# Compute SCRIPT_DIR before cd so relative BASH_SOURCE resolves correctly
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Source shared library for reference extraction
source "$SCRIPT_DIR/lib/extract_doc_references.sh"

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

# Check required tools
for tool in gh jq; do
  if ! command -v "$tool" &> /dev/null; then
    echo "$tool not found. Skipping devrel review check."
    exit 0
  fi
done

# Get the PR number from various sources
PR_NUMBER=""
BRANCH="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")}"

# Method 1: Use provided argument if available
if [[ -n "$PR_NUMBER_ARG" ]]; then
  PR_NUMBER="$PR_NUMBER_ARG"
  echo "Using provided PR #$PR_NUMBER"
# Method 2: Extract PR number from merge queue ref name (gh-readonly-queue/next/pr-XXX-SHA)
elif [[ -n "${GITHUB_REF_NAME:-}" ]]; then
  MERGE_QUEUE_PR=$(echo "$GITHUB_REF_NAME" | sed -n 's|gh-readonly-queue/.*/pr-\([0-9]*\)-.*|\1|p')
  if [[ -n "$MERGE_QUEUE_PR" ]]; then
    PR_NUMBER="$MERGE_QUEUE_PR"
    echo "Detected PR #$PR_NUMBER from merge queue ref $GITHUB_REF_NAME"
  fi
# Method 3: Use branch to find PR (same pattern as ci.sh)
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

# Extract all reference file paths from markdown frontmatter
# Expected format: references: ["path/from/repo/root/file.ts", "another/file.ts"]
# Paths should be absolute from repository root (not relative with ../)
# Also create a mapping of source files to documentation files
# Note: We only scan docs-developers, docs-operate, docs-participate (current docs), not versioned_docs/
# Versioned docs are historical snapshots and should not be modified when references change
echo "Extracting references from markdown files in $DOCS_DIR..."

# Create a temporary file to store the mapping
MAPPING_FILE=$(mktemp)
trap "rm -f $MAPPING_FILE" EXIT

extract_references_mapping "$DOCS_DIR" "$MAPPING_FILE"
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
  echo "WARNING: The following referenced paths do not exist:"
  echo -e "$MISSING_PATHS"
  echo "Please update the 'references' frontmatter in the affected documentation files."
  send_slack_message "⚠️ *Stale doc references detected*\\nThe following paths in \`references\` frontmatter do not exist:\\n$(echo -e "$MISSING_PATHS" | sed 's/$/\\n/g')"
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
        if [[ -n "${FILE_TO_DOCS_MAP[$ref_file]:-}" ]]; then
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

# Check if AztecProtocol/devrel team is already a requested reviewer
echo "Checking if devrel team is already a requested reviewer..."

REVIEW_REQUESTS_JSON=$(gh pr view "$PR_NUMBER" --json reviewRequests 2>/dev/null || echo "")
REQUESTED_TEAMS=$(echo "$REVIEW_REQUESTS_JSON" | jq -r '.reviewRequests[]? | select(.slug != null) | .slug' 2>/dev/null || echo "")

echo "Requested teams: ${REQUESTED_TEAMS:-none}"

# Determine if devrel review request and Slack notification should be skipped
SKIP_REVIEW=false

if [[ -n "$REQUESTED_TEAMS" ]] && echo "$REQUESTED_TEAMS" | grep -q "devrel"; then
  echo "AztecProtocol/devrel team is already a requested reviewer for PR #$PR_NUMBER."
  SKIP_REVIEW=true
fi

if [[ "$SKIP_REVIEW" != "true" ]]; then
  # Check if any devrel team member has already approved
  echo "Checking if devrel team member has already approved..."
  DEVREL_MEMBERS=$(gh api orgs/AztecProtocol/teams/devrel/members --jq '.[].login' 2>/dev/null || echo "")
  if [[ -n "$DEVREL_MEMBERS" ]]; then
    APPROVERS=$(gh pr view "$PR_NUMBER" --json reviews -q '.reviews[] | select(.state == "APPROVED") | .author.login' 2>/dev/null || echo "")
    if [[ -n "$APPROVERS" ]]; then
      while IFS= read -r approver; do
        if echo "$DEVREL_MEMBERS" | grep -qx "$approver"; then
          echo "PR #$PR_NUMBER already approved by devrel team member: $approver."
          SKIP_REVIEW=true
          break
        fi
      done <<< "$APPROVERS"
    fi
  fi
fi

# Get PR URL and title (needed for both Slack and ClaudeBox)
PR_URL=$(gh pr view "$PR_NUMBER" --json url -q .url 2>/dev/null || echo "https://github.com/AztecProtocol/aztec-packages/pull/$PR_NUMBER")
PR_TITLE=$(gh pr view "$PR_NUMBER" --json title -q .title 2>/dev/null || echo "")

# Request devrel review (only if not already done)
if [[ "$SKIP_REVIEW" != "true" ]]; then
  echo "Requesting AztecProtocol/devrel team as a reviewer for PR #$PR_NUMBER..."
  if gh pr edit "$PR_NUMBER" --add-reviewer AztecProtocol/devrel 2>/dev/null; then
    echo "✓ Successfully requested AztecProtocol/devrel team as a reviewer."
  else
    echo "⚠ Failed to request AztecProtocol/devrel team as a reviewer."
  fi
else
  echo "Skipping reviewer request (already handled)."
fi

# Build changed references summary (used for both Slack and ClaudeBox)
CHANGED_SUMMARY=""
ALL_DOCS=""
CHANGED_FILE_COUNT=0
SORTED_KEYS=$(for key in "${!FILE_TO_DOCS_MAP[@]}"; do echo "$key"; done | sort)

while IFS= read -r changed_file; do
  [[ -z "$changed_file" ]] && continue
  CHANGED_FILE_COUNT=$((CHANGED_FILE_COUNT + 1))

  docs="${FILE_TO_DOCS_MAP[$changed_file]}"
  IFS='|' read -ra DOC_ARRAY <<< "$docs"
  DOC_LIST=$(printf ", %s" "${DOC_ARRAY[@]}")
  DOC_LIST="${DOC_LIST:2}"
  CHANGED_SUMMARY="${CHANGED_SUMMARY}${changed_file} -> ${DOC_LIST}; "
  for doc_file in "${DOC_ARRAY[@]}"; do
    if ! echo "$ALL_DOCS" | grep -qF "$doc_file"; then
      ALL_DOCS="${ALL_DOCS}${doc_file}\n"
    fi
  done
done <<< "$SORTED_KEYS"
CHANGED_SUMMARY="${CHANGED_SUMMARY%%; }"
DOC_FILE_COUNT=$(echo -e "$ALL_DOCS" | grep -v '^$' | sort -u | wc -l)

# Dispatch ClaudeBox
echo "Dispatching ClaudeBox workflow..."
CLAUDEBOX_RUNS_URL="https://github.com/AztecProtocol/aztec-packages/actions/workflows/claudebox.yml"
CLAUDEBOX_STATUS=""

if gh workflow run claudebox.yml \
  -f prompt="PR #$PR_NUMBER ($PR_TITLE) changed source files referenced by documentation. Analyze the changes and update the affected documentation. Changed references: $CHANGED_SUMMARY. Follow the update-doc-references skill (.claude/skills/update-doc-references/SKILL.md)." \
  -f link="$PR_URL"; then
  echo "✓ ClaudeBox dispatched for PR #$PR_NUMBER."
  CLAUDEBOX_STATUS="dispatched"
else
  echo "⚠ Failed to dispatch ClaudeBox workflow. Manual review may be needed."
  CLAUDEBOX_STATUS="failed"
fi

# Send or update Slack notification (one message per PR, updated on each run)
SLACK_CHANNEL="${SLACK_DOC_UPDATE_CHANNEL:-docs-alerts}"
TS=""
CHANNEL_ID=""

if [[ -n "${AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN:-}" ]]; then
  # Build the Slack message
  NOW=$(date -u '+%Y-%m-%d %H:%M UTC')
  SLACK_MESSAGE="📚 *Documentation References Updated*\\n\\nThe following source files changed in <$PR_URL|PR #$PR_NUMBER> are referenced by documentation:\\n"

  while IFS= read -r changed_file; do
    [[ -z "$changed_file" ]] && continue
    SLACK_MESSAGE="${SLACK_MESSAGE}\\n*\`${changed_file}\`*"
    docs="${FILE_TO_DOCS_MAP[$changed_file]}"
    IFS='|' read -ra DOC_ARRAY <<< "$docs"
    for doc_file in "${DOC_ARRAY[@]}"; do
      SLACK_MESSAGE="${SLACK_MESSAGE}\\n  • \`${doc_file}\`"
    done
  done <<< "$SORTED_KEYS"

  SLACK_MESSAGE="${SLACK_MESSAGE}\\n\\n*Summary:* ${CHANGED_FILE_COUNT} changed file(s) referenced by ${DOC_FILE_COUNT} documentation file(s)"

  if [[ "$CLAUDEBOX_STATUS" == "dispatched" ]]; then
    SLACK_MESSAGE="${SLACK_MESSAGE}\\n\\n:robot_face: *ClaudeBox dispatched* — <$CLAUDEBOX_RUNS_URL|view workflow runs>\\n_Last updated: ${NOW}_"
  else
    SLACK_MESSAGE="${SLACK_MESSAGE}\\n\\n:warning: *ClaudeBox dispatch failed* — manual review needed\\n_Last updated: ${NOW}_"
  fi

  # Look up channel ID
  CHANNEL_ID=$(curl -sS "https://slack.com/api/conversations.list?types=public_channel&limit=200" \
    -H "Authorization: Bearer $AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN" | jq -r ".channels[] | select(.name==\"$SLACK_CHANNEL\") | .id" 2>/dev/null || echo "")

  if [[ -n "$CHANNEL_ID" ]]; then
    # Search channel history for an existing message about this PR (paginate up to 1000 messages)
    EXISTING_TS=""
    CURSOR=""
    PAGES=0
    while [[ $PAGES -lt 5 ]]; do
      PAGES=$((PAGES + 1))
      HISTORY_URL="https://slack.com/api/conversations.history?channel=$CHANNEL_ID&limit=200"
      [[ -n "$CURSOR" ]] && HISTORY_URL="${HISTORY_URL}&cursor=$CURSOR"

      HISTORY_RESP=$(curl -sS "$HISTORY_URL" -H "Authorization: Bearer $AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN")

      EXISTING_TS=$(echo "$HISTORY_RESP" | \
        jq -r ".messages[]? | select(.text != null and .bot_id != null and (.text | contains(\"PR #$PR_NUMBER\"))) | .ts" 2>/dev/null | head -1 || echo "")
      [[ -n "$EXISTING_TS" ]] && break

      CURSOR=$(echo "$HISTORY_RESP" | jq -r '.response_metadata.next_cursor // empty' 2>/dev/null)
      [[ -z "$CURSOR" ]] && break
    done

    if [[ -n "$EXISTING_TS" ]]; then
      # Update existing message
      echo "Updating existing Slack message for PR #$PR_NUMBER..."
      RESP=$(curl -sS -X POST https://slack.com/api/chat.update \
        -H "Authorization: Bearer $AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN" \
        -H "Content-type: application/json" \
        -d "$(jq -n --arg c "$CHANNEL_ID" --arg ts "$EXISTING_TS" --arg t "$SLACK_MESSAGE" \
          '{channel:$c, ts:$ts, text:$t}')")
      TS="$EXISTING_TS"
    else
      # Post new message
      echo "Sending Slack notification to #${SLACK_CHANNEL}..."
      RESP=$(curl -sS -X POST https://slack.com/api/chat.postMessage \
        -H "Authorization: Bearer $AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN" \
        -H "Content-type: application/json" \
        -d "$(jq -n --arg c "$CHANNEL_ID" --arg t "$SLACK_MESSAGE" '{channel:$c, text:$t}')")
      TS=$(echo "$RESP" | jq -r '.ts // empty')
    fi

    SLACK_OK=$(echo "$RESP" | jq -r '.ok // empty')
    if [[ "$SLACK_OK" == "true" ]]; then
      echo "✓ Slack notification sent/updated successfully."
    else
      SLACK_ERR=$(echo "$RESP" | jq -r '.error // "unknown error"' 2>/dev/null)
      echo "⚠ Slack API error: $SLACK_ERR" >&2
    fi
  else
    echo "⚠ Could not find Slack channel #$SLACK_CHANNEL"
  fi
else
  echo "AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN not set, skipping Slack notification"
fi
