#!/usr/bin/env bash
set -euo pipefail

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
function apply_single {
  local sha="$1" before=$(git rev-parse --verify HEAD)
  if git cherry-pick "$sha" >/dev/null 2>&1; then
    git diff --quiet HEAD~1 HEAD && { git reset --hard "$before"; return 1; }
    return 0
  else
    git cherry-pick --abort || true
    git reset --hard "$before"; return 1
  fi
}

# Try commits[i..j] as **one squash commit**.
# Success criteria:
#   • the squash merges cleanly
#   • if j+1 < total, that next commit cherry-picks cleanly (sim test)
function apply_batch_squash {
  local i=$1 j=$2 before=$(git rev-parse --verify HEAD)

  # 1. stage combined diff with merge --squash
  if ! git merge --squash --no-commit "${commits[$j]}" >/dev/null 2>&1; then
    git merge --abort >/dev/null 2>&1 || true
    git reset --hard "$before"
    return 1
  fi
  git diff --cached --quiet && { git reset --hard "$before"; return 1; }

  # 2. commit with linked title
  links=(); for ((k=i;k<=j;k++)); do links+=("$(github_link "${commits[$k]}")"); done
  git commit -m "squash: $(IFS=, ; echo "${links[*]}")" >/dev/null

  # 3. look-ahead test
  local next=$((j+1))
  if (( next < total )); then
    if git cherry-pick --no-commit "${commits[$next]}" >/dev/null 2>&1; then
      git cherry-pick --abort >/dev/null 2>&1 || true   # undo test pick
      return 0
    fi
    git cherry-pick --abort >/dev/null 2>&1 || true
    git reset --hard "$before"
    return 1
  fi
  return 0                      # squash was last chunk
}

###############################################################################
# greedy loop
###############################################################################
idx=0
while (( idx < total )); do
  if apply_single "${commits[$idx]}"; then
    ((idx++))
    continue
  fi

  applied_batch=false
  for ((end=idx+1; end<total; end++)); do
    if apply_batch_squash "$idx" "$end"; then
      idx=$((end+1))
      applied_batch=true
      break
    fi
  done

  $applied_batch || die "rebase failed: even squashing whole tail conflicted"
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

