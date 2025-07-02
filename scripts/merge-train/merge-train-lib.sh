#!/bin/bash

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

function log_info {
  echo -e "${GREEN}[INFO]${NC} $*"
}

function log_warn {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

function log_error {
  echo -e "${RED}[ERROR]${NC} $*"
}


function get_pr_for_branch {
  local branch="$1"
  gh pr list --state open --head "$branch" --json number,autoMergeRequest --jq '.[0]'
}

function pr_has_auto_merge {
  local pr_number="$1"
  local result=$(gh pr view "$pr_number" --json autoMergeRequest --jq '.autoMergeRequest')
  [[ -n "$result" ]]
}

function get_pr_merge_commits {
  local pr_number="$1"
  gh api "repos/{owner}/{repo}/pulls/$pr_number/commits" --jq '.[] | select(.parents | length > 1) | .sha'
}

function cancel_ci_runs {
  local commit_sha="$1"
  local workflow_file="${2:-ci3.yml}"
  
  log_info "Looking for runs to cancel for commit $commit_sha"
  
  local runs=$(gh run list --commit "$commit_sha" --workflow "$workflow_file" --status in_progress --json databaseId --jq '.[].databaseId')
  
  if [[ -n "$runs" ]]; then
    for run_id in $runs; do
        log_info "Cancelling run $run_id"
        gh run cancel "$run_id" || log_warn "Failed to cancel run $run_id"
    done
  else
    log_info "No active runs found for commit $commit_sha"
  fi
}



function enable_auto_merge {
  local pr_number="$1"
  
  local reviews=$(gh pr view "$pr_number" --json reviews --jq '.reviews[] | select(.state == "APPROVED")')
  if [[ -z "$reviews" ]]; then
    log_info "Approving PR #$pr_number"
    gh pr review "$pr_number" --approve --body "🤖 Auto-approved"
  fi
  
  log_info "Enabling auto-merge for PR #$pr_number"
  gh pr merge "$pr_number" --auto --merge
}

function branch_exists {
  local branch="$1"
  git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1
}

function get_meaningful_commits {
  local base="$1"
  local head="$2"
  
  git log --oneline --no-merges --reverse "${base}..${head}" \
    --pretty=format:"%s" | grep -v "^\[empty\]" || true
}
