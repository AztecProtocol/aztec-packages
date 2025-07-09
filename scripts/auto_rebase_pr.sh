#!/usr/bin/env bash
set -euo pipefail

# args
pr_head_ref=${1:-}
pr_base_ref=${2:-}
[[ -z $pr_head_ref || -z $pr_base_ref ]] && { echo "usage: $0 <pr_head_ref> <pr_base_ref>" >&2; exit 1; }

merge_base=$(git merge-base "origin/$pr_base_ref" "origin/$pr_head_ref")

# collect commits, excluding empty commits, merge commits and previous squashed PR merges
commits=($(
  git rev-list --reverse \
    --grep='\[empty\]' --grep='(#' \
    --no-merges \
    --invert-grep \
    "$merge_base..origin/$pr_head_ref"
))

if [ ${#commits[@]} -eq 0 ]; then
  echo "No commits to rebase" >&2
fi

# create working branch
work_branch="auto-rebase-$pr_head_ref"
git switch --force-create "$work_branch" "origin/$pr_base_ref"

# cherry-pick each commit
for commit in "${commits[@]}"; do
  if ! git cherry-pick "$commit"; then
    echo "Failed to cherry-pick $(git log -1 --format='%h %s' "$commit")" >&2
    git cherry-pick --abort 2>/dev/null || true
    git switch -
    git branch -D "$work_branch"
    exit 1
  fi
done

if [ "${PUSH:-0}" -eq 1 ]; then
  # update PR branch
  git switch --force-create "$pr_head_ref" "origin/$pr_base_ref"
  git git reset --hard "$work_branch"
  git push origin "$pr_head_ref" --force-with-lease
else
  echo "You are on a successful rebase branch. Use 'git log' to look around."
  echo "To return, just do 'git checkout $pr_head_ref'."
  echo "If you like what you see you can do:"
  echo git reset --hard "$work_branch"
  echo git push --force-with-lease
fi

