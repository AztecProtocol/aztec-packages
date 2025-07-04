#!/usr/bin/env bash
set -xeuo pipefail

###############################################################################
# helpers
###############################################################################
function die            { echo "❌  $*" >&2; exit 1; }
function is_merge       { [[ $(git rev-list --parents -n1 "$1" | wc -w) -gt 2 ]]; }
function has_pr_suffix  { [[ $(git show -s --format=%s "$1") =~ \(\#[0-9]+\)$ ]]; }
function is_empty_tree  { git diff --quiet "$1"^ "$1"; }
function github_link    {
  local sha="$1" repo=$(git remote get-url origin)
  repo=${repo%.git}; repo=${repo/git@github.com:/https:\/\/github.com\/}
  repo=${repo/https:\/\/github.com:/https:\/\/github.com\/}
  echo "[${sha:0:7}](${repo}/commit/${sha})"
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
while read -r c; do
  is_merge "$c"      && continue
  is_empty_tree "$c" && continue
  has_pr_suffix "$c" && continue
  commits+=("$c")
done < <(git rev-list --reverse "$merge_base".."origin/$pr_head_ref")

[[ ${#commits[@]} -eq 0 ]] && exit 0
total=${#commits[@]}

###############################################################################
# prepare working branch
###############################################################################
work_branch="auto-rebase-${pr_head_ref//\//-}"
git switch -c "$work_branch" "origin/$pr_base_ref" 2>/dev/null || {
  git switch "$work_branch"
  git reset --hard "origin/$pr_base_ref"
}

###############################################################################
# low-level helpers
###############################################################################
# Try to apply a single commit using squash merge
function apply_single {
  local sha="$1" before=$(git rev-parse --verify HEAD)
  
  # Try to squash merge this single commit
  if git merge --squash --no-commit "$sha" >/dev/null 2>&1; then
    # Check if there are any changes
    if git diff --cached --quiet; then
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
    return 0
  else
    git merge --abort >/dev/null 2>&1 || true
    git reset --hard "$before"
    return 1
  fi
}

# Try to squash merge from merge_base to commits[j]
# This includes ALL commits (including merge commits) in that range
function apply_batch_squash {
  local i=$1 j=$2 before=$(git rev-parse --verify HEAD)
  
  # Try to squash merge everything up to commits[j]
  if ! git merge --squash --no-commit "${commits[$j]}" >/dev/null 2>&1; then
    git merge --abort >/dev/null 2>&1 || true
    git reset --hard "$before"
    return 1
  fi
  
  # Check if there are any changes
  if git diff --cached --quiet; then
    git reset --hard "$before"
    return 1
  fi
  
  # Create the squash commit with links to meaningful commits only
  links=()
  commit_list=""
  for ((k=i; k<=j; k++)); do
    local sha="${commits[$k]}"
    local short_sha="${sha:0:7}"
    local msg=$(git log -1 --format=%s "$sha")
    links+=("$(github_link "$sha")")
    commit_list="${commit_list}- ${short_sha} ${msg} (${short_sha})"$'\n'
  done
  
  # Remove trailing newline
  commit_list=${commit_list%$'\n'}
  
  # Commit with both comma-separated links and detailed list
  git commit -m "squash: $(IFS=, ; echo "${links[*]}")" -m "$commit_list" >/dev/null
  
  return 0
}

###############################################################################
# main rebasing loop
###############################################################################
idx=0
while (( idx < total )); do
  # First, try to squash merge just this single commit
  if apply_single "${commits[$idx]}"; then
    ((idx++)) || true
    continue
  fi

  # Single commit failed. Now we need to batch.
  # Try progressively larger batches starting from merge_base (or previous commit)
  # up to commits[idx], commits[idx+1], etc.
  applied_batch=false
  
  for ((end=idx; end<total; end++)); do
    if apply_batch_squash "$idx" "$end"; then
      idx=$((end+1))
      applied_batch=true
      break
    fi
  done

  # If we still can't apply anything, try to squash merge the entire PR branch
  if ! $applied_batch; then
    echo "Warning: Unable to rebase commits individually. Squashing entire PR branch..." >&2
    
    # Reset to base and squash merge the entire PR
    git reset --hard "origin/$pr_base_ref"
    if git merge --squash "origin/$pr_head_ref" >/dev/null 2>&1; then
      # Commit with links to all meaningful commits
      links=()
      commit_list=""
      for ((k=0; k<total; k++)); do
        sha="${commits[$k]}"
        short_sha="${sha:0:7}"
        msg=$(git log -1 --format=%s "$sha")
        links+=("$(github_link "$sha")")
        commit_list="${commit_list}- ${short_sha} ${msg} (${short_sha})"$'\n'
      done
      
      # Remove trailing newline
      commit_list=${commit_list%$'\n'}
      
      git commit -m "squash: $(IFS=, ; echo "${links[*]}")" -m "$commit_list" >/dev/null
      break
    else
      git merge --abort >/dev/null 2>&1 || true
      die "rebase failed: unable to squash merge entire PR branch"
    fi
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

