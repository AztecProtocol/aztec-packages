#!/usr/bin/env bash
set -euo pipefail

# args
pr_head_ref=${1:-}
pr_base_ref=${2:-}
[[ -z $pr_head_ref || -z $pr_base_ref ]] && { echo "usage: $0 <pr_head_ref> <pr_base_ref>" >&2; exit 1; }

merge_base=$(git merge-base "origin/$pr_base_ref" "$pr_head_ref")

# collect commits, excluding empty commits, merge commits and previous squashed PR merges
commits=($(
  git rev-list --reverse \
    --grep='\[empty\]' --grep='(#' \
    --no-merges \
    --invert-grep \
    "$merge_base..$pr_head_ref"
))

if [ ${#commits[@]} -eq 0 ]; then
  echo "No commits to rebase" >&2
fi

# create working branch
work_branch="auto-rebase-$pr_head_ref"
git switch --force-create "$work_branch" "origin/$pr_base_ref"

# cherry-pick each commit
for commit in "${commits[@]}"; do
  echo "Cherry-picking $(git log -1 --format='%h %s' "$commit")"
  if ! git cherry-pick -X theirs "$commit"; then
    echo "Failed to cherry-pick $(git log -1 --format='%h %s' "$commit")" >&2

    # Check if we're in an interactive terminal
    if [ -t 0 ] && [ -t 1 ]; then
      echo ""
      echo "Cherry-pick conflict detected! Dropping into bash shell."
      echo "You can:"
      echo "  - Fix conflicts and run: git cherry-pick --continue"
      echo "  - Skip this commit: git cherry-pick --skip"
      echo "  - Abort and exit: git cherry-pick --abort && exit"
      echo "  - Exit shell to abort the rebase"
      echo ""

      # Drop into interactive bash
      bash || true

      # Check if cherry-pick is still in progress
      if git rev-parse --verify CHERRY_PICK_HEAD >/dev/null 2>&1; then
        echo "Cherry-pick still in progress, aborting..."
        git cherry-pick --abort 2>/dev/null || true
        git switch -
        git branch -D "$work_branch"
        exit 1
      fi
    else
      git cherry-pick --abort 2>/dev/null || true
      git switch -
      git branch -D "$work_branch"
      exit 1
    fi
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
