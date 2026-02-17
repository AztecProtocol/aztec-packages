#!/usr/bin/env bash
set -euo pipefail

# Test script for update_doc_references.sh
# This script helps test the documentation update workflow locally
#
# Usage:
#   ./scripts/test_update_doc_references.sh [pr_number]
#
# If no PR number is provided, it will:
# 1. Find a recent merged PR that changed files referenced in docs
# 2. Simulate testing against that PR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT=$(git rev-parse --show-toplevel)

# Source shared libraries
source "$SCRIPT_DIR/lib/extract_doc_references.sh"

cd "$REPO_ROOT/docs"

echo "=== Documentation Update Test Script ==="
echo ""

# Check for Anthropic API key
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "WARNING: ANTHROPIC_API_KEY environment variable is not set."
  echo "Claude analysis will be skipped. Set the key to test full functionality:"
  echo "  export ANTHROPIC_API_KEY='your-api-key-here'"
  echo ""
fi

# Check for Claude CLI
if ! command -v claude &> /dev/null; then
  echo "WARNING: Claude Code CLI not found."
  echo "Install it with: npm install -g @anthropic-ai/claude-code"
  echo ""
fi

# Get PR number
PR_NUMBER="${1:-}"

if [[ -z "$PR_NUMBER" ]]; then
  echo "No PR number provided. Looking for a recent PR with referenced file changes..."
  echo ""

  # Extract all referenced files from docs using shared lib
  MAPPING_FILE=$(mktemp)
  TEMP_FILES_TO_CLEAN=("$MAPPING_FILE")
  trap 'rm -f "${TEMP_FILES_TO_CLEAN[@]}"' EXIT

  extract_references_mapping "." "$MAPPING_FILE"
  REFERENCED_FILES=$(get_unique_references "$MAPPING_FILE" | head -20)

  echo "Sample referenced files:"
  echo "$REFERENCED_FILES" | head -5
  echo "..."
  echo ""

  # Find recent merged PRs
  echo "Checking recent PRs for changes to referenced files..."

  for pr in $(gh pr list --state merged --limit 20 --json number --jq '.[].number'); do
    CHANGED=$(gh pr view "$pr" --json files --jq '.files[].path' 2>/dev/null || echo "")

    # Check if any changed file matches referenced files
    while IFS= read -r ref_file; do
      [[ -z "$ref_file" ]] && continue
      match_pattern="${ref_file%/\*}"
      if echo "$CHANGED" | grep -qF "$match_pattern"; then
        echo "Found PR #$pr with changes to referenced file: $match_pattern"
        PR_NUMBER="$pr"
        break 2
      fi
    done <<< "$REFERENCED_FILES"
  done

  if [[ -z "$PR_NUMBER" ]]; then
    echo ""
    echo "No recent PR found with changes to referenced files."
    echo ""
    echo "You can still test by providing a specific PR number:"
    echo "  ./scripts/test_update_doc_references.sh <pr_number>"
    echo ""
    echo "Or create a test branch with changes to a referenced file."
    exit 0
  fi
fi

echo ""
echo "Testing with PR #$PR_NUMBER"
echo ""

# Show PR details
echo "PR Details:"
gh pr view "$PR_NUMBER" --json title,url,state,baseRefName --jq '"  Title: \(.title)\n  URL: \(.url)\n  State: \(.state)\n  Base: \(.baseRefName)"'
echo ""

# Show changed files
echo "Changed files in PR:"
gh pr view "$PR_NUMBER" --json files --jq '.files[].path' | head -10
echo ""

# Find which docs reference these files
echo "Checking which docs reference these files..."
CHANGED_FILES=$(gh pr view "$PR_NUMBER" --json files --jq '.files[].path')

# Use shared library to build mappings
MAPPING_FILE=$(mktemp)
TEMP_FILES_TO_CLEAN+=("$MAPPING_FILE")

extract_references_mapping "." "$MAPPING_FILE"
build_change_mappings "$MAPPING_FILE" "$CHANGED_FILES"

if [[ -z "$CHANGED_REFERENCES" ]] || [[ "$CHANGED_REFERENCES" == "\n" ]]; then
  echo ""
  echo "No documentation files reference the changed files in this PR."
  echo "The update script would exit early in this case."
  exit 0
fi

echo ""
echo "Affected documentation files:"
for doc in "${!DOC_TO_FILES_MAP[@]}"; do
  echo "  $doc"
  echo "    References: ${DOC_TO_FILES_MAP[$doc]}"
done

echo ""
echo "=== Ready to Test ==="
echo ""
echo "To run the update script in DRY_RUN mode (won't send Slack):"
echo ""
echo "  LOCAL_TEST=1 DRY_RUN=1 ./scripts/update_doc_references.sh $PR_NUMBER"
echo ""
echo "To run with Slack notification (requires SLACK_BOT_TOKEN):"
echo ""
echo "  LOCAL_TEST=1 DRY_RUN=0 ./scripts/update_doc_references.sh $PR_NUMBER"
echo ""

# Ask if user wants to proceed
read -p "Run in DRY_RUN mode now? [y/N] " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "Running update_doc_references.sh in DRY_RUN mode..."
  echo ""
  LOCAL_TEST=1 DRY_RUN=1 ./scripts/update_doc_references.sh "$PR_NUMBER"
fi
