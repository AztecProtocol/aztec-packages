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

# Get PR info including author and repository information
pr_info=$(gh pr view "$pr_number" --json title,body,author,headRepository,isCrossRepository)
pr_title=$(echo "$pr_info" | jq -r '.title')
pr_body=$(echo "$pr_info" | jq -r '.body // ""')
pr_author=$(echo "$pr_info" | jq -r '.author.login')
head_repo=$(echo "$pr_info" | jq -r '.headRepository.nameWithOwner')
is_fork=$(echo "$pr_info" | jq -r '.isCrossRepository')

# Get the PR author's name and email
user_id=$(gh api "/users/$pr_author" --jq '.id')
author_email="${user_id}+${pr_author}@users.noreply.github.com"

# Create a temporary worktree to do the squashing
worktree_dir=$(mktemp -d)
trap "git worktree remove --force '$worktree_dir' 2>/dev/null || true" EXIT

# Add worktree at current HEAD
git worktree add "$worktree_dir" HEAD

# Do all work in the worktree
cd "$worktree_dir"

# Configure git with author's identity in worktree
git config user.name "$pr_author"
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

# Collect all unique authors from non-merge commits that are not in the base branch
# Get all commits between merge_base and HEAD, excluding merges
authors_info=$(git log "$merge_base..$original_head" --no-merges --format='%an <%ae>' | sort -u)

# Build Co-authored-by trailers, excluding the main PR author
co_authors=""
while IFS= read -r author_line; do
  # Skip empty lines, the main PR author, AztecBot, and tech@aztecprotocol.com
  if [[ -n "$author_line" ]] && [[ "$author_line" != *"$pr_author"* ]] && [[ "$author_line" != *"$author_email"* ]] && [[ "$author_line" != *"AztecBot"* ]] && [[ "$author_line" != *"tech@aztecprotocol.com"* ]]; then
    co_authors="${co_authors}Co-authored-by: ${author_line}
"
  fi
done <<< "$authors_info"

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

# Create commit with PR title, body, and co-authors
commit_message="$pr_title${pr_body:+

$pr_body}${co_authors:+

$co_authors}"
git commit -m "$commit_message" --no-verify

# Push to the correct repository (fork or origin)
if [[ "$is_fork" == "true" ]]; then
  # It's a fork - need to push to the fork repository
  echo "Detected fork: pushing to $head_repo"
  
  # Add the fork as a remote (assumes GITHUB_TOKEN env var is set from workflow)
  git remote add fork "https://x-access-token:${GITHUB_TOKEN}@github.com/${head_repo}.git"
  
  # Push to the fork
  git push --force fork "HEAD:refs/heads/$branch"
else
  # Not a fork - push to origin as before
  echo "Not a fork: pushing to origin"
  git push --force origin "HEAD:refs/heads/$branch"
fi

echo "Squashed PR #$pr_number!"
