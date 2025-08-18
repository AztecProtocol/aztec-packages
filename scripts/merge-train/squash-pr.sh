#!/bin/bash

set -xeuo pipefail

# Usage: squash-pr.sh <pr-number> <head-ref> <base-ref> <base-sha>
if [[ $# -ne 4 ]]; then
  echo "Usage: $0 <pr-number> <head-ref> <base-ref> <base-sha>"
  exit 1
fi

pr_number="$1"
branch="$2"
base_branch="$3"
base_sha="$4"

# Get PR info including author
pr_info=$(gh pr view "$pr_number" --json title,body,author)
pr_title=$(echo "$pr_info" | jq -r '.title')
pr_body=$(echo "$pr_info" | jq -r '.body // ""')
pr_author=$(echo "$pr_info" | jq -r '.author.login')

# Try to get author email from the most recent non-merge commit
author_email=$(git log --no-merges -1 --format='%ae')
author_name=$(git log --no-merges -1 --format='%an')

# Fall back to GitHub username if needed
if [[ -z "$author_email" ]] || [[ "$author_email" == "null" ]]; then
  author_email="${pr_author}@users.noreply.github.com"
  author_name="$pr_author"
fi

# Create a temporary worktree to do the squashing
worktree_dir=$(mktemp -d)
trap "git worktree remove --force '$worktree_dir' 2>/dev/null || true" EXIT

# Add worktree at current HEAD
git worktree add "$worktree_dir" HEAD

# Do all work in the worktree
cd "$worktree_dir"

# Configure git with author's identity in worktree
git config user.name "$author_name"
git config user.email "$author_email"

# Save our current branch commits
original_head=$(git rev-parse HEAD)

# Deepen by 50 to ensure we have the base commit
git fetch --deepen=50

# Fetch the base commit with depth
git fetch --depth=50 origin "$base_sha"

# Fetch the base branch to ensure we have it
git fetch origin "$base_branch"

# Find the merge-base between our branch and the base branch
merge_base=$(git merge-base "$original_head" "origin/$base_branch")

# Reset to the merge-base
git reset --hard "$merge_base"

# Merge our original commits back
git merge "$original_head" --no-edit || {
  echo "Failed to merge PR commits - conflicts exist"
  git merge --abort || true
  exit 1
}

# Now squash all the PR commits into one by resetting to the base
git reset --soft "$merge_base"

# Create commit with PR title and body
commit_message="$pr_title${pr_body:+

$pr_body}"
git commit -m "$commit_message" --no-verify

# Push (use full ref to handle case where branch doesn't exist on remote)
git push --force origin "HEAD:refs/heads/$branch"

echo "Squashed PR #$pr_number!"
