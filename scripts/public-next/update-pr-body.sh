#!/usr/bin/env bash

set -euo pipefail

BASE_BRANCH="${BASE_BRANCH:-public-next}"
HEAD_BRANCH="${HEAD_BRANCH:-next}"
REMOTE="${REMOTE:-origin}"
DRY_RUN="${DRY_RUN:-0}"

function require_command {
  local command="$1"
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
}

function configure_gh_repo {
  local remote_url repo

  if [[ -n "${GH_REPO:-}" ]]; then
    export GH_REPO
    return
  fi

  if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    export GH_REPO="$GITHUB_REPOSITORY"
    return
  fi

  remote_url=$(git remote get-url "$REMOTE" 2>/dev/null || true)
  case "$remote_url" in
    git@github.com:*)
      repo="${remote_url#git@github.com:}"
      ;;
    https://github.com/*)
      repo="${remote_url#https://github.com/}"
      ;;
    *)
      return
      ;;
  esac

  repo="${repo%.git}"
  export GH_REPO="$repo"
}

function pr_for_subject {
  local subject="$1"

  if [[ "$subject" =~ Merge[[:space:]]pull[[:space:]]request[[:space:]]#([0-9]+) ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi

  if [[ "$subject" =~ \(\#([0-9]+)\)$ ]]; then
    echo "${BASH_REMATCH[1]}"
  fi
}

function commit_subject {
  git log --format=%s -n1 "$1"
}

function first_parent {
  git rev-parse "${1}^1" 2>/dev/null || git rev-parse "${1}^"
}

function merge_train_subsystem {
  local subject="$1"

  if [[ "$subject" =~ merge-train/([^[:space:]]+) ]]; then
    echo "${BASH_REMATCH[1]}"
  fi
}

function merge_train_commits {
  local merge_commit="$1"
  local parent

  parent=$(git rev-parse "${merge_commit}^1" 2>/dev/null || true)
  [[ -n "$parent" ]] || return
  git rev-list --reverse "${parent}..${merge_commit}^2" 2>/dev/null || true
}

function patch_still_present {
  local commit="$1"
  local parent patch_file

  parent=$(first_parent "$commit")
  patch_file=$(mktemp)
  git diff --binary "$parent" "$commit" >"$patch_file"

  if [[ ! -s "$patch_file" ]]; then
    rm -f "$patch_file"
    return 1
  fi

  if (cd "$verify_worktree" && git apply --reverse --3way --check "$patch_file" >/dev/null 2>&1); then
    rm -f "$patch_file"
    return 0
  fi

  rm -f "$patch_file"
  return 1
}

function append_pr_line {
  local pr_number="$1"
  local pr_json="$2"
  local prefix="$3"
  local title url

  title=$(jq -r '.title' <<<"$pr_json")
  url=$(jq -r '.url' <<<"$pr_json")

  if [[ -n "$prefix" ]]; then
    echo "- [${prefix}] [#${pr_number}: ${title}](${url})" >>"$body_file"
  else
    echo "- [#${pr_number}: ${title}](${url})" >>"$body_file"
  fi
}

require_command git
require_command gh
require_command jq
configure_gh_repo

if [[ -n "$(git status --porcelain)" && "$DRY_RUN" != "1" ]]; then
  echo "Working tree is dirty; refusing to update PR body" >&2
  exit 1
fi

git fetch "$REMOTE" "$BASE_BRANCH" "$HEAD_BRANCH" --no-tags

base_ref="${REMOTE}/${BASE_BRANCH}"
head_ref="${REMOTE}/${HEAD_BRANCH}"
base_sha=$(git rev-parse "$base_ref")
head_sha=$(git rev-parse "$head_ref")

pr_info=$(gh pr list \
  --state open \
  --base "$BASE_BRANCH" \
  --head "$HEAD_BRANCH" \
  --json number,url \
  --jq '.[0] // empty')

if [[ -z "$pr_info" ]]; then
  echo "No open PR found for ${HEAD_BRANCH} -> ${BASE_BRANCH}; skipping"
  exit 0
fi

pr_number=$(jq -r '.number' <<<"$pr_info")

body_file=$(mktemp)
payload_file=""
verify_worktree=$(mktemp -d)
function cleanup {
  rm -f "$body_file" "$payload_file"
  git worktree remove --force "$verify_worktree" >/dev/null 2>&1 || rm -rf "$verify_worktree"
}
trap cleanup EXIT

git worktree add --detach --quiet "$verify_worktree" "$head_ref"

{
  echo "## Private PRs still present in \`${BASE_BRANCH}..${HEAD_BRANCH}\`"
  echo
  echo "_${base_sha:0:10}..${head_sha:0:10}_"
  echo
} >"$body_file"

declare -A seen_prs=()
present_count=0

while read -r commit; do
  [[ -n "$commit" ]] || continue

  subject=$(commit_subject "$commit")
  subsystem=$(merge_train_subsystem "$subject")

  if [[ -n "$subsystem" ]]; then
    while read -r train_commit; do
      [[ -n "$train_commit" ]] || continue

      train_subject=$(commit_subject "$train_commit")
      pr_candidate=$(pr_for_subject "$train_subject")
      [[ -n "$pr_candidate" ]] || continue
      [[ -z "${seen_prs[$pr_candidate]:-}" ]] || continue

      if ! patch_still_present "$train_commit"; then
        echo "Skipping PR #$pr_candidate; patch from ${train_commit:0:10} is not present in $HEAD_BRANCH" >&2
        continue
      fi

      pr_json=$(gh pr view "$pr_candidate" \
        --json number,title,url,state \
        --jq '.' 2>/dev/null || true)

      if [[ -z "$pr_json" || "$(jq -r '.state' <<<"$pr_json")" != "MERGED" ]]; then
        continue
      fi

      seen_prs[$pr_candidate]=1
      present_count=$((present_count + 1))
      append_pr_line "$pr_candidate" "$pr_json" "$subsystem"
    done < <(merge_train_commits "$commit")

    continue
  fi

  if [[ "$subject" == Merge* && "$subject" != *"#"* ]]; then
    continue
  fi

  pr_candidate=$(pr_for_subject "$subject")
  [[ -n "$pr_candidate" ]] || continue
  [[ -z "${seen_prs[$pr_candidate]:-}" ]] || continue

  if ! patch_still_present "$commit"; then
    echo "Skipping PR #$pr_candidate; patch from ${commit:0:10} is not present in $HEAD_BRANCH" >&2
    continue
  fi

  pr_json=$(gh pr view "$pr_candidate" \
    --json number,title,url,state \
    --jq '.' 2>/dev/null || true)

  if [[ -z "$pr_json" || "$(jq -r '.state' <<<"$pr_json")" != "MERGED" ]]; then
    continue
  fi

  seen_prs[$pr_candidate]=1
  present_count=$((present_count + 1))
  append_pr_line "$pr_candidate" "$pr_json" ""
done < <(git log --reverse --first-parent --format=%H "${base_ref}..${head_ref}")

if [[ "$present_count" -eq 0 ]]; then
  echo "*No merged private PR patches are present in the compare range.*" >>"$body_file"
fi

if [[ "$DRY_RUN" == "1" ]]; then
  cat "$body_file"
  exit 0
fi

payload_file=$(mktemp)
jq -n --rawfile body "$body_file" '{ body: $body }' >"$payload_file"
gh api --method PATCH "repos/{owner}/{repo}/issues/${pr_number}" --input "$payload_file" >/dev/null
echo "Updated PR #${pr_number} body from content-present patches in ${BASE_BRANCH}..${HEAD_BRANCH}"
