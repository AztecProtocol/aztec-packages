#!/usr/bin/env bash
set -euo pipefail

# intelligent-rebase-simple.sh
#
# USAGE
#   ./intelligent-rebase-simple.sh <pr_head_ref> <pr_base_ref>
#
# EXAMPLE
#   ./intelligent-rebase-simple.sh merge-train/barretenberg origin/main
#
# Required: a GitHub-backed remote called "origin".

###############################################################################
# utilities
###############################################################################
function die {
  echo "❌  $*" >&2
  exit 1
}

function is_merge {
  [[ $(git rev-list --parents -n1 "$1" | wc -w) -gt 2 ]]
}

function github_commit_url {
  local sha="$1"
  local repo_url
  repo_url=$(git remote get-url origin)

  # normalise to https://github.com/user/repo
  repo_url=${repo_url%.git}
  repo_url=${repo_url/git@github.com:/https:\/\/github.com\/}
  repo_url=${repo_url/https:\/\/github.com:/https:\/\/github.com\/}

  echo "${repo_url}/commit/${sha}"
}

###############################################################################
# arguments & setup
###############################################################################
pr_head_ref=${1:-}
pr_base_ref=${2:-}
[[ -z $pr_head_ref || -z $pr_base_ref ]] && die "usage: $0 <pr_head_ref> <pr_base_ref>"

echo "[auto-rebase] rebasing $pr_head_ref onto $pr_base_ref"

git fetch origin "$pr_base_ref" "$pr_head_ref"

merge_base=$(git merge-base "origin/$pr_base_ref" "origin/$pr_head_ref")
echo "[auto-rebase] merge-base: $merge_base"

commits=($(git rev-list --reverse --no-merges "$merge_base".."origin/$pr_head_ref"))
[[ ${#commits[@]} -eq 0 ]] && { echo "[auto-rebase] nothing to do"; exit 0; }

work_branch="auto-rebase-${pr_head_ref//\//-}"
git switch -c "$work_branch" "origin/$pr_base_ref" 2>/dev/null || {
  git switch "$work_branch"
  git reset --hard "origin/$pr_base_ref"
}

###############################################################################
# attempt linear cherry-pick
###############################################################################
echo "[auto-rebase] cherry-picking ${#commits[@]} commits…"
cherry_ok=true
applied_count=0

for c in "${commits[@]}"; do
  if git cherry-pick "$c" >/dev/null 2>&1; then
    ((applied_count++))
    echo "  ✔  ${c:0:7} applied"
  else
    echo "  ⚠️   conflict at ${c:0:7}; falling back to squash"
    git cherry-pick --abort || true
    cherry_ok=false
    break
  fi
done

###############################################################################
# fall back to squash merge if needed
###############################################################################
if ! $cherry_ok; then
  git reset --hard "origin/$pr_base_ref"

  echo "[auto-rebase] performing squash merge"
  git merge --squash "origin/$pr_head_ref"

  # build squash commit message
  commit_msg="squash: rebased ${pr_head_ref} onto ${pr_base_ref}

original commits:"
  for s in "${commits[@]}"; do
    subj=$(git show -s --format=%s "$s")
    commit_msg+="
- ${s:0:7} ${subj} ($(github_commit_url "$s"))"
  done

  git commit -m "$commit_msg"
  applied_count=1
fi

###############################################################################
# fast-forward the PR branch & push (if token present)
###############################################################################
git branch -f "$pr_head_ref" HEAD
git switch "$pr_head_ref"
git branch -D "$work_branch"

echo "[auto-rebase] done — branch $pr_head_ref now has $applied_count commit(s)"

if [[ -n "${gh_token:-}" || -n "${github_token:-}" ]]; then
  echo "[auto-rebase] pushing to origin/$pr_head_ref"
  git push origin "$pr_head_ref" --force-with-lease
else
  echo "[auto-rebase] dry-run — not pushing"
  git log --oneline "origin/$pr_base_ref".."$pr_head_ref"
fi
