#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# helpers
###############################################################################
function die            { echo "❌  $*" >&2; exit 1; }
function is_merge       { [[ $(git rev-list --parents -n1 "$1" | wc -w) -gt 2 ]]; }
function has_pr_suffix  { [[ $(git show -s --format=%s "$1") =~ \(\#[0-9]+\)$ ]]; }
function is_empty_tree  { git diff --quiet "$1"^ "$1"; }
function short_sha {
  echo "${1:0:7}"
}

###############################################################################
# args & fetch
###############################################################################
pr_head_ref=${1:-}; pr_base_ref=${2:-}
[[ -z $pr_head_ref || -z $pr_base_ref ]] && die "usage: $0 <pr_head_ref> <pr_base_ref>"

git fetch origin "$pr_base_ref" "$pr_head_ref"
merge_base=$(git merge-base "origin/$pr_base_ref" "origin/$pr_head_ref")

###############################################################################
# collect candidate commits
###############################################################################
commits=()
echo "📋 Collecting commits from $merge_base to origin/$pr_head_ref" >&2
while read -r c; do
  msg=$(git log -1 --format=%s "$c")
  short=$(short_sha "$c")
  if is_merge "$c"; then
    echo "  ⏭️  Skipping merge commit: $short - $msg" >&2
    continue
  fi
  if is_empty_tree "$c"; then
    echo "  ⏭️  Skipping empty commit: $short - $msg" >&2
    continue
  fi
  if has_pr_suffix "$c"; then
    echo "  ⏭️  Skipping PR commit: $short - $msg" >&2
    continue
  fi
  echo "  ✅ Including commit: $short - $msg" >&2
  commits+=("$c")
done < <(git rev-list --reverse "$merge_base".."origin/$pr_head_ref")

[[ ${#commits[@]} -eq 0 ]] && { echo "No commits to rebase" >&2; exit 0; }
total=${#commits[@]}
echo "📊 Total commits to rebase: $total" >&2

###############################################################################
# configure git based on most common author in candidate commits
###############################################################################
echo "🔧 Configuring git author from candidate commits" >&2

# Get the most common author from the candidate commits
author_info=""
if [[ ${#commits[@]} -gt 0 ]]; then
  author_info=$(
    for commit in "${commits[@]}"; do
      git log -1 --format="%an|%ae" "$commit"
    done | sort | uniq -c | sort -rn | head -1 | awk '{$1=""; print $0}' | xargs
  )
fi

if [[ -n "$author_info" ]]; then
  author_name=$(echo "$author_info" | cut -d'|' -f1)
  author_email=$(echo "$author_info" | cut -d'|' -f2)
  echo "  Using most common author: $author_name <$author_email>" >&2
else
  # Fallback to aztec-bot
  author_name="AztecBot"
  author_email="tech@aztecprotocol.com"
  echo "  Using fallback author: $author_name <$author_email>" >&2
fi

git config user.name "$author_name"
git config user.email "$author_email"

###############################################################################
# prepare working branch
###############################################################################
work_branch="auto-rebase-${pr_head_ref//\//-}"
git switch -c "$work_branch" "origin/$pr_base_ref" 2>/dev/null || {
  git switch "$work_branch"
  git reset --hard "origin/$pr_base_ref"
}

###############################################################################
# helper functions
###############################################################################
# Try to apply a single commit using squash merge
function apply_single {
  local sha="$1" before=$(git rev-parse --verify HEAD)
  local short="$(short_sha "$sha")"
  local msg=$(git log -1 --format=%s "$sha")
  
  echo "🔍 Trying single commit: $short - $msg" >&2
  
  # Try to squash merge this single commit
  if git merge --squash --no-commit "$sha" >/dev/null 2>&1; then
    # Check if there are any changes
    if git diff --cached --quiet; then
      echo "  ❌ No changes" >&2
      git reset --hard "$before"
      return 1
    fi
    
    # Commit with the original commit's title
    local original_msg=$(git log -1 --format=%s "$sha")
    local original_body=$(git log -1 --format=%b "$sha")
    if [[ -n "$original_body" ]]; then
      git commit -m "$original_msg" -m "$original_body" >/dev/null
    else
      git commit -m "$original_msg" >/dev/null
    fi
    echo "  ✅ Applied" >&2
    return 0
  else
    echo "  ❌ Conflict" >&2
    git merge --abort >/dev/null 2>&1 || true
    git reset --hard "$before"
    return 1
  fi
}

# Create a squash commit for a range of commits
function create_squash_commit {
  local start_idx=$1 end_idx=$2
  
  # If it's just a single commit, preserve its original message
  if [[ $start_idx -eq $end_idx ]]; then
    local sha="${commits[$start_idx]}"
    local original_msg=$(git log -1 --format=%s "$sha")
    local original_body=$(git log -1 --format=%b "$sha")
    if [[ -n "$original_body" ]]; then
      git commit -m "$original_msg" -m "$original_body" >/dev/null
    else
      git commit -m "$original_msg" >/dev/null
    fi
    return
  fi
  
  # Multiple commits - use squash format
  links=()
  commit_list=""
  for ((k=start_idx; k<=end_idx; k++)); do
    local sha="${commits[$k]}"
    local short_sha="${sha:0:7}"
    local msg=$(git log -1 --format=%s "$sha")
    links+=("$short_sha")
    commit_list="${commit_list}- ${short_sha} ${msg} (${short_sha})"$'\n'
  done
  
  # Remove trailing newline
  commit_list=${commit_list%$'\n'}
  
  # Commit with both comma-separated links and detailed list
  git commit -m "squash: $(IFS=, ; echo "${links[*]}")" -m "$commit_list" >/dev/null
}

# Try to find and apply the minimal batch that works
function find_minimal_batch {
  local start_idx=$1
  local before=$(git rev-parse --verify HEAD)
  
  echo "🔄 Finding minimal batch starting from commit $start_idx..." >&2
  
  # Try increasingly larger batches
  for ((end_idx=start_idx; end_idx<total; end_idx++)); do
    echo "  📦 Testing batch [$start_idx..$end_idx]..." >&2
    
    # Reset to before state
    git reset --hard "$before" >/dev/null 2>&1
    
    # Try to cherry-pick all commits in this range
    local all_applied=true
    for ((k=start_idx; k<=end_idx; k++)); do
      if ! git cherry-pick --no-commit "${commits[$k]}" >/dev/null 2>&1; then
        all_applied=false
        git cherry-pick --abort >/dev/null 2>&1 || true
        break
      fi
    done
    
    if $all_applied && ! git diff --cached --quiet; then
      # Success! Create the squash commit
      echo "  ✅ Batch [$start_idx..$end_idx] works!" >&2
      create_squash_commit "$start_idx" "$end_idx"
      echo $((end_idx + 1))  # Output next index to process
      return 0
    fi
    
    # Reset for next attempt
    git reset --hard "$before" >/dev/null 2>&1
  done
  
  # If we get here, we couldn't find a working batch
  return 1
}

###############################################################################
# main rebasing loop
###############################################################################
idx=0
while (( idx < total )); do
  # First, always try to apply as a single commit
  if apply_single "${commits[$idx]}"; then
    ((idx++)) || true
    continue
  fi
  
  # Single commit failed. Find the minimal batch that works
  if new_idx=$(find_minimal_batch "$idx"); then
    idx=$new_idx
  else
    # Can't find any working batch. Last resort: squash all remaining
    echo "⚠️  Cannot find working batch. Squashing all remaining commits..." >&2
    
    # Reset and try to squash merge all remaining commits at once
    before=$(git rev-parse --verify HEAD)
    
    # Create a temp branch at the last commit
    temp_branch="temp-squash-remaining-$$"
    git branch "$temp_branch" "${commits[$((total-1))]}" >/dev/null 2>&1
    
    if git merge --squash "$temp_branch" >/dev/null 2>&1 && ! git diff --cached --quiet; then
      create_squash_commit "$idx" "$((total-1))"
      git branch -D "$temp_branch" >/dev/null 2>&1
      break
    else
      git merge --abort >/dev/null 2>&1 || true
      git branch -D "$temp_branch" >/dev/null 2>&1 || true
      git reset --hard "$before"
      
      # Ultimate fallback: squash entire PR
      echo "❌ Even remaining commits failed. Squashing entire PR..." >&2
      git reset --hard "origin/$pr_base_ref"
      
      if git merge --squash "origin/$pr_head_ref" >/dev/null 2>&1; then
        create_squash_commit 0 "$((total-1))"
      else
        git merge --abort >/dev/null 2>&1 || true
        die "rebase failed: unable to squash merge entire PR branch"
      fi
    fi
    break
  fi
done

###############################################################################
# fast-forward PR branch & optional push
###############################################################################
git branch -f "$pr_head_ref" HEAD
git switch "$pr_head_ref"
git branch -D "$work_branch"

if [[ -n "${GH_TOKEN:-}" || -n "${GITHUB_TOKEN:-}" ]]; then
  git push origin "$pr_head_ref" --force-with-lease
fi

echo "✅ Successfully rebased $pr_head_ref" >&2
