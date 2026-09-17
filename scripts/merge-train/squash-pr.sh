#!/usr/bin/env bash

set -xeuo pipefail

# Rewrites a PR branch as a single commit on top of its merge base with the base branch and
# force-pushes it.
#
# This runs on the CI runner's shallow checkout (depth = the PR's commit count), and it never deepens
# it: on this repo a `git fetch --deepen=50` costs minutes. Everything that would need history comes
# from the GitHub API instead (merge base, commit count, co-authors), and the squashed commit is built
# with `git commit-tree` from the tree that is already checked out. Only two objects move over the
# network: the merge-base commit (fetched at depth 1) and the new commit (pushed).
#
# Usage: squash-pr.sh <pr-number> <head-ref> <base-ref>
if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <pr-number> <head-ref> <base-ref>"
  exit 1
fi

pr_number="$1"
branch="$2"
base_branch="$3"

# Get PR info including author and repository information
pr_info=$(gh pr view "$pr_number" --json title,body,author,headRepository,headRepositoryOwner,isCrossRepository)
pr_title=$(echo "$pr_info" | jq -r '.title')
pr_body=$(echo "$pr_info" | jq -r '.body // ""')
pr_author=$(echo "$pr_info" | jq -r '.author.login')
head_repo=$(echo "$pr_info" | jq -r '.headRepository.nameWithOwner')
head_owner=$(echo "$pr_info" | jq -r '.headRepositoryOwner.login')
is_fork=$(echo "$pr_info" | jq -r '.isCrossRepository')

# Get the PR author's name and email
user_id=$(gh api "/users/$pr_author" --jq '.id')
author_email="${user_id}+${pr_author}@users.noreply.github.com"

original_head=$(git rev-parse HEAD)

# Merge base and commit count, without local history. Compare against the exact commit we have
# checked out (the one CI tested); fall back to the branch name for fork heads whose SHA the base
# repo cannot resolve.
compare=$(gh api "repos/{owner}/{repo}/compare/${base_branch}...${original_head}?per_page=1" 2>/dev/null \
  || gh api "repos/{owner}/{repo}/compare/${base_branch}...${head_owner}:${branch}?per_page=1")
merge_base=$(echo "$compare" | jq -r '.merge_base_commit.sha')
commit_count=$(echo "$compare" | jq -r '.total_commits')

# Idempotency guard: if the branch is already a single commit on top of the base there is nothing
# to squash. Rewriting it anyway produces a new commit (fresh committer timestamp, identical tree)
# and force-pushes it, which retriggers CI and re-enters this script — an infinite loop while the
# ci-squash-and-merge label remains. Skip the rewrite and force-push so the caller can go straight
# to merging.
if [[ "$commit_count" -le 1 ]]; then
  echo "PR #$pr_number is already a single commit on top of $base_branch; nothing to squash."
  exit 0
fi

# Collect all unique authors from the PR's non-merge commits.
authors_info=$(gh api --paginate "repos/{owner}/{repo}/pulls/${pr_number}/commits" \
  --jq '.[] | select(.parents | length == 1) | "\(.commit.author.name) <\(.commit.author.email)>"' | sort -u)

# Build Co-authored-by trailers, excluding the main PR author
co_authors=""
while IFS= read -r author_line; do
  # Skip empty lines, the main PR author, AztecBot, and tech@aztecprotocol.com
  if [[ -n "$author_line" ]] && [[ "$author_line" != *"$pr_author"* ]] && [[ "$author_line" != *"$author_email"* ]] && [[ "$author_line" != *"AztecBot"* ]] && [[ "$author_line" != *"tech@aztecprotocol.com"* ]]; then
    co_authors="${co_authors}Co-authored-by: ${author_line}
"
  fi
done <<< "$authors_info"

# The merge-base commit must exist locally to be named as the parent. Depth 1 fetches that one
# commit plus whatever of its tree the checkout does not already share with HEAD.
git fetch --depth=1 origin "$merge_base"

# Create commit with PR title, body, and co-authors. The tree is HEAD's tree unchanged, so the
# squashed commit has the same tree hash CI just passed on.
commit_message="$pr_title${pr_body:+

$pr_body}${co_authors:+

$co_authors}"
squashed=$(printf '%s\n' "$commit_message" | git stripspace \
  | GIT_AUTHOR_NAME="$pr_author" GIT_AUTHOR_EMAIL="$author_email" \
    GIT_COMMITTER_NAME="$pr_author" GIT_COMMITTER_EMAIL="$author_email" \
    git commit-tree "${original_head}^{tree}" -p "$merge_base")

# Push to the correct repository (fork or origin). The lease pins the remote branch to the commit CI
# tested, so a push that raced this job is not overwritten.
if [[ "$is_fork" == "true" ]]; then
  # It's a fork - need to push to the fork repository
  echo "Detected fork: pushing to $head_repo"

  # Add the fork as a remote (assumes GITHUB_TOKEN env var is set from workflow)
  git remote add fork "https://x-access-token:${GITHUB_TOKEN}@github.com/${head_repo}.git"

  # Push to the fork
  git push --force-with-lease="refs/heads/${branch}:${original_head}" fork "${squashed}:refs/heads/${branch}"
else
  # Not a fork - push to origin as before
  echo "Not a fork: pushing to origin"
  git push --force-with-lease="refs/heads/${branch}:${original_head}" origin "${squashed}:refs/heads/${branch}"
fi

echo "Squashed PR #$pr_number as $squashed!"
