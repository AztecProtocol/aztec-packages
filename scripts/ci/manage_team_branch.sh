#!/usr/bin/env bash
set -euo pipefail

# Script to manage team feature branches
# Usage: ./manage_team_branch.sh <command> [options]

source $(git rev-parse --show-toplevel)/ci3/source

# Configuration
TEAM_BRANCH="${TEAM_BRANCH:-feat/bb-changes}"
BASE_BRANCH="${BASE_BRANCH:-next}"

# Helper functions
function branch_exists {
  local branch=$1
  git rev-parse --verify "$branch" >/dev/null 2>&1
}

function pr_exists {
  local branch=$1
  gh pr list --head "$branch" --state open --json number --jq '.[0].number' 2>/dev/null
}

function get_pr_body {
  local pr_number=$1
  gh pr view "$pr_number" --json body --jq '.body' 2>/dev/null || echo ""
}

function get_team_name {
  # Extract team name from branch name
  case "$TEAM_BRANCH" in
    feat/bb-changes)
      echo "Barretenberg"
      ;;
    *)
      echo "Team"
      ;;
  esac
}

function collect_changes {
  local since_commit=$1
  local branch=$2
  
  local prs=""
  local commits=""
  
  # Get all commits since the merge base
  while IFS= read -r line; do
    local commit_hash=$(echo "$line" | cut -d' ' -f1)
    local commit_msg=$(echo "$line" | cut -d' ' -f2-)
    local author=$(git show -s --format='%an' "$commit_hash")
    
    # Check if this commit is a merge commit from a PR
    if [[ "$commit_msg" =~ ^Merge\ pull\ request\ #([0-9]+) ]]; then
      local pr_num="${BASH_REMATCH[1]}"
      local pr_title=$(gh pr view "$pr_num" --json title --jq '.title' 2>/dev/null || echo "Unknown PR")
      prs="${prs}- #${pr_num}: ${pr_title} (@${author})\\n"
    elif [[ ! "$commit_msg" =~ ^Merge\ [a-f0-9]{40}\ into ]]; then
      # Regular commit (not a merge)
      commits="${commits}- ${commit_hash:0:7}: ${commit_msg} (@${author})\\n"
    fi
  done < <(git log --oneline "${since_commit}..${branch}")
  
  echo -e "PRS:${prs}"
  echo -e "COMMITS:${commits}"
}

function update_pr_description {
  local pr_number=$1
  local team_name=$(get_team_name)
  
  # Get merge base to find changes
  local merge_base=$(git merge-base "origin/$BASE_BRANCH" "origin/$TEAM_BRANCH")
  
  # Collect changes
  local changes=$(collect_changes "$merge_base" "origin/$TEAM_BRANCH")
  local prs=$(echo "$changes" | grep "^PRS:" | sed 's/^PRS://')
  local commits=$(echo "$changes" | grep "^COMMITS:" | sed 's/^COMMITS://')
  
  # Format empty sections
  [ -z "$prs" ] && prs="_No PRs merged yet_"
  [ -z "$commits" ] && commits="_No direct commits yet_"
  
  # Build PR description
  local description="## ${team_name} Team Changes

### Merged PRs
${prs}

### Direct Commits
${commits}

---
This PR is automatically managed by the team merge train workflow."

  gh pr edit "$pr_number" --body "$description"
}

# Command: setup - Initialize the team branch
function cmd_setup {
  echo_header "Setting up team branch: $TEAM_BRANCH"
  
  # Ensure we're on the latest base branch
  git fetch origin "$BASE_BRANCH"
  
  if branch_exists "$TEAM_BRANCH"; then
    warning "Branch $TEAM_BRANCH already exists locally"
  else
    log "Creating branch $TEAM_BRANCH from origin/$BASE_BRANCH"
    git checkout -b "$TEAM_BRANCH" "origin/$BASE_BRANCH"
  fi
  
  # Push branch to remote
  log "Pushing $TEAM_BRANCH to origin"
  git push -u origin "$TEAM_BRANCH"
  
  # Create PR if it doesn't exist
  local pr_number=$(pr_exists "$TEAM_BRANCH")
  local team_name=$(get_team_name)
  
  if [[ -z "$pr_number" ]]; then
    log "Creating PR for $TEAM_BRANCH"
    gh pr create \
      --base "$BASE_BRANCH" \
      --head "$TEAM_BRANCH" \
      --title "${team_name} Team Changes" \
      --body "$(cat <<EOF
## ${team_name} Team Changes

### Merged PRs
_No PRs merged yet_

### Direct Commits
_No direct commits yet_

---
This PR is automatically managed by the team merge train workflow.
EOF
)"
  else
    log "PR #$pr_number already exists for $TEAM_BRANCH"
  fi
}

# Command: merge - Merge the team branch to base
function cmd_merge {
  echo_header "Preparing to merge $TEAM_BRANCH to $BASE_BRANCH"
  
  # Get current PR
  local pr_number=$(pr_exists "$TEAM_BRANCH")
  if [[ -z "$pr_number" ]]; then
    error "No open PR found for $TEAM_BRANCH"
    exit 1
  fi
  
  # Ensure we have the latest changes
  git fetch origin "$BASE_BRANCH" "$TEAM_BRANCH"
  
  # Check out team branch
  git checkout "$TEAM_BRANCH"
  
  # Merge base branch into team branch
  log "Merging $BASE_BRANCH into $TEAM_BRANCH"
  if ! git merge "origin/$BASE_BRANCH" --no-edit; then
    error "Merge conflict detected. Manual intervention required."
    git merge --abort
    exit 1
  fi
  
  # Push updated branch
  git push origin "$TEAM_BRANCH"
  
  # Wait for checks to pass
  log "Waiting for status checks..."
  gh pr checks "$pr_number" --watch || true
  
  # Perform the squash merge
  log "Squash merging PR #$pr_number"
  gh pr merge "$pr_number" --squash --auto
  
  # Store the PR number for recreation
  echo "$pr_number" > /tmp/merged_pr_number
}

# Command: recreate - Recreate the team branch after merge
function cmd_recreate {
  echo_header "Recreating $TEAM_BRANCH after merge"
  
  # Get the previous PR number
  local previous_pr=$(cat /tmp/merged_pr_number 2>/dev/null || echo "unknown")
  
  # Fetch latest
  git fetch origin "$BASE_BRANCH"
  
  # Check out base branch
  git checkout "$BASE_BRANCH"
  git pull origin "$BASE_BRANCH"
  
  # Delete local team branch
  git branch -D "$TEAM_BRANCH" 2>/dev/null || true
  
  # Create new team branch from base
  git checkout -b "$TEAM_BRANCH"
  
  # Merge using -X theirs to take all changes from next
  git merge -X theirs "origin/$BASE_BRANCH" --no-edit
  
  # Force push to remote
  git push -f origin "$TEAM_BRANCH"
  
  # Create new PR
  local team_name=$(get_team_name)
  log "Creating new PR for $TEAM_BRANCH"
  
  gh pr create \
    --base "$BASE_BRANCH" \
    --head "$TEAM_BRANCH" \
    --title "${team_name} Team Changes" \
    --body "$(cat <<EOF
## ${team_name} Team Changes

### Merged PRs
_No new PRs merged yet_

### Direct Commits
_No new direct commits yet_

### History
Previous PR: #${previous_pr} (merged $(date -u +'%Y-%m-%d %H:%M UTC'))

---
This PR is automatically managed by the team merge train workflow.
EOF
)"
}

# Command: update - Update PR description with new changes
function cmd_update {
  echo_header "Updating PR description for $TEAM_BRANCH"
  
  local pr_number=$(pr_exists "$TEAM_BRANCH")
  if [[ -z "$pr_number" ]]; then
    error "No open PR found for $TEAM_BRANCH"
    exit 1
  fi
  
  # Fetch latest changes
  git fetch origin "$BASE_BRANCH" "$TEAM_BRANCH"
  
  # Update PR description
  update_pr_description "$pr_number"
  
  log "Updated PR #$pr_number"
}

# Main command dispatcher
case "${1:-}" in
  setup)
    cmd_setup
    ;;
  merge)
    cmd_merge
    ;;
  recreate)
    cmd_recreate
    ;;
  update)
    cmd_update
    ;;
  *)
    echo "Usage: $0 {setup|merge|recreate|update}"
    echo ""
    echo "Commands:"
    echo "  setup    - Initialize the team branch and create PR"
    echo "  merge    - Merge the team branch to base (after updating from base)"
    echo "  recreate - Recreate the team branch after a successful merge"
    echo "  update   - Update the PR description with latest changes"
    exit 1
    ;;
esac