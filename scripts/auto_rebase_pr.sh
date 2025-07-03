#!/bin/bash
set -euo pipefail

# Enhanced auto-rebase script that intelligently filters commits
# Arguments from workflow
PR_HEAD_REF=$1
PR_BASE_REF=$2

echo "[AUTO-REBASE] Starting intelligent rebase of $PR_HEAD_REF onto $PR_BASE_REF"

# Fetch latest
git fetch origin "$PR_BASE_REF" "$PR_HEAD_REF"

# Find the common ancestor
MERGE_BASE=$(git merge-base "origin/$PR_BASE_REF" "origin/$PR_HEAD_REF")
echo "[AUTO-REBASE] Common ancestor: $MERGE_BASE"

# Get all non-merge commits
ALL_COMMITS=$(git rev-list --reverse --no-merges "$MERGE_BASE".."origin/$PR_HEAD_REF")
COMMIT_ARRAY=($ALL_COMMITS)
TOTAL_COMMITS=${#COMMIT_ARRAY[@]}

if [[ $TOTAL_COMMITS -eq 0 ]]; then
  echo "[AUTO-REBASE] No commits to rebase!"
  exit 0
fi

echo "[AUTO-REBASE] Found $TOTAL_COMMITS non-merge commits to process"

# Create working branch
WORK_BRANCH="auto-rebase-$PR_HEAD_REF"
git checkout -b "$WORK_BRANCH" "origin/$PR_BASE_REF" || git checkout "$WORK_BRANCH"
git reset --hard "origin/$PR_BASE_REF"

# Enable rerere for conflict memory
git config rerere.enabled true

# Track what we're doing
APPLIED=0
SKIPPED_PR=0
SKIPPED_EMPTY=0
INCLUDED_PR=0

# Function to check if commit is a squashed PR
is_squashed_pr() {
  local msg="$1"
  if [[ "$msg" =~ \(#[0-9]+\)$ ]]; then
      return 0
  fi
  return 1
}

# Function to check if commit is essential
is_essential_commit() {
  local commit="$1"
  local msg=$(git log --format=%s -1 $commit)
  
  # Not essential if it's a PR
  if is_squashed_pr "$msg"; then
      return 1
  fi
  
  # Not essential if it's merge-train related
  if [[ "$msg" =~ merge-train ]] || [[ "$msg" =~ "Start merge-train" ]] || [[ "$msg" =~ "stop merge-train" ]]; then
      return 1
  fi
  
  # Essential if it contains work-related keywords
  if [[ "$msg" =~ (feat|fix|chore|test|docs|refactor|perf|style|build|ci):.*[^#][^0-9]+$ ]]; then
      return 0
  fi
  
  # Essential if it mentions specific work
  if [[ "$msg" =~ (implement|add|update|improve|fix|change|modify|refactor|optimize) ]]; then
      return 0
  fi
  
  return 1
}

# First pass: identify essential commits
echo "[AUTO-REBASE] Analyzing commits..."
ESSENTIAL_COMMITS=()
for commit in "${COMMIT_ARRAY[@]}"; do
  if is_essential_commit "$commit"; then
      ESSENTIAL_COMMITS+=("$commit")
      msg=$(git log --format=%s -1 $commit)
      echo "  Essential: ${msg:0:70}"
  fi
done

echo "[AUTO-REBASE] Found ${#ESSENTIAL_COMMITS[@]} essential commits out of $TOTAL_COMMITS"

# Function to check if PR is a dependency
is_dependency_pr() {
  local pr_commit="$1"
  local pr_files=$(git diff-tree --no-commit-id --name-only -r $pr_commit 2>/dev/null || echo "")
  
  if [[ -z "$pr_files" ]]; then
      return 1
  fi
  
  # Check if any essential commit touches the same files
  for essential in "${ESSENTIAL_COMMITS[@]}"; do
      essential_files=$(git diff-tree --no-commit-id --name-only -r $essential 2>/dev/null || echo "")
      
      for pf in $pr_files; do
          for ef in $essential_files; do
              if [[ "$pf" == "$ef" ]]; then
                  return 0
              fi
          done
      done
  done
  
  return 1
}

# Process each commit
echo "[AUTO-REBASE] Processing commits..."

for i in "${!COMMIT_ARRAY[@]}"; do
  commit="${COMMIT_ARRAY[$i]}"
  msg=$(git log --format=%s -1 $commit)
  short_msg="${msg:0:70}"
  
  # Check if essential
  is_essential=false
  for essential in "${ESSENTIAL_COMMITS[@]}"; do
      if [[ "$commit" == "$essential" ]]; then
          is_essential=true
          break
      fi
  done
  
  # Skip non-essential PRs unless they're dependencies
  if ! $is_essential && is_squashed_pr "$msg"; then
      if is_dependency_pr "$commit"; then
          echo "  $short_msg [PR dependency]"
      else
          echo "  $short_msg [skipping PR]"
          SKIPPED_PR=$((SKIPPED_PR + 1))
          continue
      fi
  elif ! $is_essential; then
      echo "  $short_msg [skipping non-essential]"
      continue
  else
      echo "  $short_msg [essential]"
  fi
  
  # Try to cherry-pick
  if git cherry-pick "$commit" >/dev/null 2>&1; then
      # Check if empty
      if git diff HEAD~1 HEAD --quiet 2>/dev/null; then
          git reset --hard HEAD~1 >/dev/null 2>&1
          SKIPPED_EMPTY=$((SKIPPED_EMPTY + 1))
          echo "    → Skipped (no changes)"
      else
          APPLIED=$((APPLIED + 1))
          if is_squashed_pr "$msg"; then
              INCLUDED_PR=$((INCLUDED_PR + 1))
          fi
          echo "    → Applied"
      fi
  else
      # Handle conflicts
      echo "    → Conflict detected, resolving..."
      
      conflicts=$(git diff --name-only --diff-filter=U)
      resolved=true
      
      for file in $conflicts; do
          # If file deleted upstream, accept deletion
          if ! git ls-tree "origin/$PR_BASE_REF":"$file" >/dev/null 2>&1; then
              git rm "$file" 2>/dev/null || true
          # Try three-way merge
          elif [[ -f "$file" ]] && git merge-file "$file" \
              <(git show :1:"$file" 2>/dev/null || echo "") \
              <(git show :3:"$file" 2>/dev/null || echo "") \
              2>/dev/null; then
              git add "$file"
          # Take incoming version
          else
              git checkout --theirs "$file" 2>/dev/null && git add "$file" 2>/dev/null || {
                  git rm "$file" 2>/dev/null || resolved=false
              }
          fi
      done
      
      if $resolved; then
          if git diff --cached --quiet; then
              git cherry-pick --skip >/dev/null 2>&1
              SKIPPED_EMPTY=$((SKIPPED_EMPTY + 1))
              echo "    → Skipped (empty after resolution)"
          elif git cherry-pick --continue --no-edit >/dev/null 2>&1; then
              APPLIED=$((APPLIED + 1))
              if is_squashed_pr "$msg"; then
                  INCLUDED_PR=$((INCLUDED_PR + 1))
              fi
              echo "    → Resolved and applied"
          else
              echo "    → Failed to continue"
              git cherry-pick --abort 2>/dev/null || true
          fi
      else
          echo "    → Failed to resolve"
          git cherry-pick --abort 2>/dev/null || true
      fi
  fi
done

# Summary
echo ""
echo "[AUTO-REBASE] Summary:"
echo "  Total commits: $TOTAL_COMMITS"
echo "  Applied: $APPLIED"
echo "  - Essential commits: $((APPLIED - INCLUDED_PR))"
echo "  - PR dependencies: $INCLUDED_PR"
echo "  Skipped: $((SKIPPED_PR + SKIPPED_EMPTY))"
echo "  - Unrelated PRs: $SKIPPED_PR"
echo "  - Empty commits: $SKIPPED_EMPTY"

# Check if we got anything
FINAL_COUNT=$(git rev-list --count "origin/$PR_BASE_REF"..HEAD)
if [[ $FINAL_COUNT -eq 0 ]]; then
  echo ""
  echo "[AUTO-REBASE] ERROR: No commits were applied!"
  exit 1
fi

# Update the PR branch
git branch -f "$PR_HEAD_REF" HEAD
git checkout "$PR_HEAD_REF"
git branch -D "$WORK_BRANCH"

echo ""
echo "[AUTO-REBASE] Complete! Branch $PR_HEAD_REF now has $FINAL_COUNT commits"

# Push if in CI
if [[ -n "${GH_TOKEN:-}" ]] || [[ -n "${GITHUB_TOKEN:-}" ]]; then
  echo "[AUTO-REBASE] Pushing to origin/$PR_HEAD_REF"
  git push origin "$PR_HEAD_REF" --force-with-lease
else
  echo "[AUTO-REBASE] Would push to origin/$PR_HEAD_REF (dry run)"
  git log --oneline "origin/$PR_BASE_REF".."$PR_HEAD_REF"
fi
