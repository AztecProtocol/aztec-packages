#!/usr/bin/env bash
set -xeuo pipefail

###############################################################################
# helpers
###############################################################################
function die            { echo "❌  $*" >&2; exit 1; }
function is_merge       { [[ $(git rev-list --parents -n1 "$1" | wc -w) -gt 2 ]]; }
function has_pr_suffix  { [[ $(git show -s --format=%s "$1") =~ \(\#[0-9]+\)$ ]]; }
function is_empty       { git diff --quiet "$1"^ "$1"; }   # true if tree unchanged
function github_commit_url {
  local sha="$1" repo
  repo=$(git remote get-url origin)
  repo=${repo%.git}
  repo=${repo/git@github.com:/https:\/\/github.com\/}
  repo=${repo/https:\/\/github.com:/https:\/\/github.com\/}
  echo "${repo}/commit/${sha}"
}

###############################################################################
# args
###############################################################################
pr_head_ref=${1:-}; pr_base_ref=${2:-}
[[ -z $pr_head_ref || -z $pr_base_ref ]] && die "usage: $0 <pr_head_ref> <pr_base_ref>"

git fetch origin "$pr_base_ref" "$pr_head_ref"
merge_base=$(git merge-base "origin/$pr_base_ref" "origin/$pr_head_ref")

###############################################################################
# collect commits to replay
###############################################################################
commits=()
while read -r c; do
  is_merge "$c"  && continue
  is_empty "$c"  && continue
  has_pr_suffix "$c" && continue
  commits+=("$c")
done < <(git rev-list --reverse "$merge_base".."origin/$pr_head_ref")

[[ ${#commits[@]} -eq 0 ]] && exit 0

###############################################################################
# working branch
###############################################################################
work_branch="auto-rebase-${pr_head_ref//\//-}"
git switch -c "$work_branch" "origin/$pr_base_ref" 2>/dev/null || {
  git switch "$work_branch"
  git reset --hard "origin/$pr_base_ref"
}

###############################################################################
# replay
###############################################################################
cherry_ok=true; applied=0; kept_commits=()
for c in "${commits[@]}"; do
  if git cherry-pick "$c"  >/dev/null 2>&1; then
    # Drop if cherry-pick produced no content
    if git diff --quiet HEAD~1 HEAD; then
      git reset --hard HEAD~1 >/dev/null
      continue
    fi
    kept_commits+=("$c"); ((applied++))
  else
    git cherry-pick --abort || true
    cherry_ok=false
    break
  fi
done

###############################################################################
# squash fallback
###############################################################################
if ! $cherry_ok; then
  git reset --hard "origin/$pr_base_ref"
  git merge --squash "origin/$pr_head_ref"

  links=()
  for s in "${kept_commits[@]}"; do
    links+=("[${s:0:7}]($(github_commit_url "$s"))")
  done
  title="squash: $(IFS=, ; echo "${links[*]}")"

  body=""
  for s in "${kept_commits[@]}"; do
    subj=$(git show -s --format=%s "$s")
    body+="
- ${s:0:7} ${subj} ($(github_commit_url "$s"))"
  done

  git commit -m "${title}${body}"
  applied=1
fi

###############################################################################
# fast-forward branch & optional push
###############################################################################
git branch -f "$pr_head_ref" HEAD
git switch "$pr_head_ref"
git branch -D "$work_branch"

if [[ -n "${GH_TOKEN:-}" || -n "${GITHUB_TOKEN:-}" ]]; then
  git push origin "$pr_head_ref" --force-with-lease
fi

