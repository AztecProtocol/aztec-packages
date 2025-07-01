#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/merge-train-lib.sh"

# Methods used from merge-train-lib.sh:
# - log_info: Log informational messages
# - pr_has_auto_merge: Check if a PR has auto-merge enabled
# - enable_auto_merge: Enable auto-merge for a PR (includes approval if needed)
# - comment_on_pr: Add a comment to a PR

# Constants
INACTIVITY_HOURS="${INACTIVITY_HOURS:-4}"
INACTIVITY_SECONDS=$((INACTIVITY_HOURS * 3600))

function get_merge_train_prs {
    gh pr list --state open --json number,headRefName,updatedAt \
        --jq '.[] | select(.headRefName | startswith("merge-train/"))'
}

function get_meaningful_commits_for_pr {
    local pr_number="$1"
    
    # Get all commits and filter out merges and empty commits
    gh api "repos/{owner}/{repo}/pulls/$pr_number/commits" --paginate \
        --jq '.[] | select(.parents | length == 1) | select(.commit.message | test("^\\[empty\\]") | not) | .sha'
}

function get_last_meaningful_commit_date {
    local pr_number="$1"
    
    local commits=$(get_meaningful_commits_for_pr "$pr_number")
    if [[ -z "$commits" ]]; then
        echo ""
        return
    fi
    
    # Get the most recent commit date
    local latest_date=""
    for sha in $commits; do
        local date=$(gh api "repos/{owner}/{repo}/commits/$sha" --jq '.commit.committer.date')
        if [[ -z "$latest_date" ]] || [[ "$date" > "$latest_date" ]]; then
            latest_date="$date"
        fi
    done
    
    echo "$latest_date"
}

function is_pr_inactive {
    local last_commit_date="$1"
    
    if [[ -z "$last_commit_date" ]]; then
        return 1
    fi
    
    local last_commit_timestamp=$(date -d "$last_commit_date" +%s)
    local current_timestamp=$(date +%s)
    local time_diff=$((current_timestamp - last_commit_timestamp))
    
    [[ $time_diff -gt $INACTIVITY_SECONDS ]]
}

# Start execution
log_info "Starting auto-merge check for inactive merge-train PRs"
log_info "Inactivity threshold: $INACTIVITY_HOURS hours"

prs=$(get_merge_train_prs)

if [[ -z "$prs" ]]; then
    log_info "No merge-train PRs found"
    exit 0
fi

while IFS= read -r pr_json; do
    pr_number=$(echo "$pr_json" | jq -r '.number')
    branch=$(echo "$pr_json" | jq -r '.headRefName')
    
    log_info "Checking PR #$pr_number ($branch)"
    
    # Get last meaningful commit date
    last_commit_date=$(get_last_meaningful_commit_date "$pr_number")
    
    if [[ -z "$last_commit_date" ]]; then
        log_info "PR #$pr_number has no meaningful commits, skipping"
        continue
    fi
    
    if is_pr_inactive "$last_commit_date"; then
        log_info "PR #$pr_number has been inactive since $last_commit_date"
        
        # Check if already has auto-merge
        if pr_has_auto_merge "$pr_number"; then
            log_info "PR #$pr_number already has auto-merge enabled"
        else
            enable_auto_merge "$pr_number"
            comment_on_pr "$pr_number" "🤖 Auto-merge enabled after $INACTIVITY_HOURS hours of inactivity. This PR will be merged automatically once all checks pass."
        fi
    else
        log_info "PR #$pr_number is still active (last commit: $last_commit_date)"
    fi
done <<< "$prs"

log_info "Auto-merge check completed"