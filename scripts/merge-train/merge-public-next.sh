#!/usr/bin/env bash

set -euo pipefail

REMOTE="${REMOTE:-origin}"
SOURCE_BRANCH="${SOURCE_BRANCH:-public-next}"
TARGET_BRANCH="${TARGET_BRANCH:-next}"
CONFLICT_EXIT_CODE="${CONFLICT_EXIT_CODE:-1}"
REAPPLY_PRIVATE_PATCHES="${REAPPLY_PRIVATE_PATCHES:-1}"

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

function log_error {
  echo -e "${RED}[ERROR]${NC} $*"
}

function log_warn {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

function require_command {
  local command="$1"
  if ! command -v "$command" >/dev/null 2>&1; then
    log_error "Missing required command: $command"
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

function branch_exists {
  local branch="$1"
  git ls-remote --exit-code --heads "$REMOTE" "$branch" >/dev/null 2>&1
}

function get_holding_pr {
  gh pr list \
    --state open \
    --base "$SOURCE_BRANCH" \
    --head "$TARGET_BRANCH" \
    --json number,autoMergeRequest \
    --jq '.[0] // empty'
}

function pr_has_auto_merge {
  local pr_info="$1"
  [[ "$(jq -r '.autoMergeRequest // empty' <<<"$pr_info")" != "" ]]
}

function post_conflict_comment {
  local source_sha="$1"
  local conflicts="$2"

  local conflict_comment
  conflict_comment="## Auto-merge to ${TARGET_BRANCH} failed

Merge conflicts detected when merging \`${SOURCE_BRANCH}\` into \`${TARGET_BRANCH}\`.

**Conflicted files:**
\`\`\`
${conflicts}
\`\`\`

Please resolve the conflicts manually."

  gh api "repos/{owner}/{repo}/commits/${source_sha}/comments" \
    -f body="$conflict_comment"
}

function commit_subject {
  git log --format=%s -n1 "$1"
}

function first_parent {
  git rev-parse "${1}^1" 2>/dev/null || git rev-parse "${1}^"
}

function is_public_next_merge {
  local subject="$1"
  [[ "$subject" == "chore: merge ${SOURCE_BRANCH} into ${TARGET_BRANCH}" ]]
}

function is_merge_train {
  local subject="$1"
  [[ "$subject" == *"merge-train/"* && "$subject" == *"#"* ]]
}

function merge_train_commits {
  local merge_commit="$1"
  local parent

  parent=$(git rev-parse "${merge_commit}^1" 2>/dev/null || true)
  [[ -n "$parent" ]] || return
  git rev-list --reverse "${parent}..${merge_commit}^2" 2>/dev/null || true
}

function patch_id_for_commit {
  local commit="$1"
  local parent

  parent=$(first_parent "$commit")
  git diff "$parent" "$commit" | git patch-id --stable | awk '{print $1}'
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

  if git apply --reverse --3way --check "$patch_file" >/dev/null 2>&1; then
    rm -f "$patch_file"
    return 0
  fi

  rm -f "$patch_file"
  return 1
}

function queue_patch_commit {
  local commit="$1"
  local patch_id
  local queued_patch_id

  patch_id=$(patch_id_for_commit "$commit")
  [[ -n "$patch_id" ]] || return

  for queued_patch_id in "${queued_patch_ids[@]}"; do
    [[ "$queued_patch_id" != "$patch_id" ]] || return
  done

  if ! patch_still_present "$commit"; then
    return
  fi

  queued_patch_ids+=("$patch_id")
  patch_queue+=("$commit")
}

function collect_private_patch_queue {
  local base="$1"
  local target="$2"
  local commit subject train_commit

  queued_patch_ids=()
  patch_queue=()

  while read -r commit; do
    [[ -n "$commit" ]] || continue

    subject=$(commit_subject "$commit")
    if is_public_next_merge "$subject"; then
      continue
    fi

    if is_merge_train "$subject"; then
      while read -r train_commit; do
        [[ -n "$train_commit" ]] || continue
        queue_patch_commit "$train_commit"
      done < <(merge_train_commits "$commit")
      continue
    fi

    if [[ "$subject" == Merge* && "$subject" != *"#"* ]]; then
      continue
    fi

    queue_patch_commit "$commit"
  done < <(git log --reverse --first-parent --format=%H "${base}..${target}")
}

function reapply_patch_commit {
  local commit="$1"
  local parent patch_file author_name author_email author_date commit_msg

  parent=$(first_parent "$commit")
  patch_file=$(mktemp)
  git diff --binary "$parent" "$commit" >"$patch_file"

  if git apply --3way --index "$patch_file"; then
    author_name=$(git show -s --format=%an "$commit")
    author_email=$(git show -s --format=%ae "$commit")
    author_date=$(git show -s --format=%aI "$commit")
    commit_msg=$(git log --format=%B -n1 "$commit")

    GIT_AUTHOR_NAME="$author_name" \
      GIT_AUTHOR_EMAIL="$author_email" \
      GIT_AUTHOR_DATE="$author_date" \
      GIT_COMMITTER_DATE="$author_date" \
      git commit -m "$commit_msg"

    rm -f "$patch_file"
    return 0
  fi

  rm -f "$patch_file"
  return 1
}

function reapply_missing_private_patches {
  local commit missing_count=0

  [[ "$REAPPLY_PRIVATE_PATCHES" == "1" ]] || return 0
  [[ "${#patch_queue[@]}" -gt 0 ]] || return 0

  echo "Verifying ${#patch_queue[@]} private patch commits after merge"

  for commit in "${patch_queue[@]}"; do
    if patch_still_present "$commit"; then
      continue
    fi

    echo "Reapplying private patch ${commit:0:10}: $(commit_subject "$commit")"
    if ! reapply_patch_commit "$commit"; then
      log_error "Failed to reapply private patch ${commit:0:10}: $(commit_subject "$commit")"
      git am --abort >/dev/null 2>&1 || true
      git reset --merge >/dev/null 2>&1 || true
      return 1
    fi

    missing_count=$((missing_count + 1))
  done

  if [[ "$missing_count" -gt 0 ]]; then
    echo "Reapplied $missing_count private patch commits on top of $SOURCE_BRANCH"
  fi
}

require_command git
require_command gh
require_command jq
configure_gh_repo

if ! branch_exists "$SOURCE_BRANCH"; then
  log_warn "Branch $SOURCE_BRANCH does not exist, skipping merge"
  exit 0
fi

if ! branch_exists "$TARGET_BRANCH"; then
  log_error "Branch $TARGET_BRANCH does not exist"
  exit 1
fi

holding_pr=$(get_holding_pr)
if [[ -n "$holding_pr" ]] && pr_has_auto_merge "$holding_pr"; then
  pr_number=$(jq -r '.number' <<<"$holding_pr")
  echo "PR #$pr_number has auto-merge enabled, skipping merge from $SOURCE_BRANCH"
  exit 0
fi

git fetch "$REMOTE" "$SOURCE_BRANCH" "$TARGET_BRANCH" --no-tags

source_ref="${REMOTE}/${SOURCE_BRANCH}"
target_ref="${REMOTE}/${TARGET_BRANCH}"
source_sha=$(git rev-parse "$source_ref")
target_sha=$(git rev-parse "$target_ref")

if git merge-base --is-ancestor "$source_sha" "$target_ref"; then
  echo "$TARGET_BRANCH already contains $SOURCE_BRANCH ($source_sha), skipping merge"
  exit 0
fi

git checkout -B "$TARGET_BRANCH" "$target_ref"

merge_base=$(git merge-base "$source_ref" "$target_ref")
if [[ "$REAPPLY_PRIVATE_PATCHES" == "1" ]]; then
  collect_private_patch_queue "$merge_base" "$target_ref"
  echo "Queued ${#patch_queue[@]} content-present private patch commits from $TARGET_BRANCH"
fi

echo "Merging $SOURCE_BRANCH ($source_sha) into $TARGET_BRANCH ($target_sha)"

if git merge "$source_ref" --no-edit -m "chore: merge ${SOURCE_BRANCH} into ${TARGET_BRANCH}"; then
  if ! reapply_missing_private_patches; then
    log_error "Merge produced a tree that could not keep private patches on top"
    post_conflict_comment "$source_sha" "private patch reapply failed" || log_warn "Failed to post conflict comment"
    exit "$CONFLICT_EXIT_CODE"
  fi

  echo "Successfully merged $SOURCE_BRANCH into $TARGET_BRANCH"
  git push "$REMOTE" "$TARGET_BRANCH"
  echo "Successfully pushed $TARGET_BRANCH"
else
  conflicts=$(git diff --name-only --diff-filter=U)
  git merge --abort || true

  log_error "Merge conflicts detected:"
  echo "$conflicts"

  post_conflict_comment "$source_sha" "$conflicts" || log_warn "Failed to post conflict comment"
  exit "$CONFLICT_EXIT_CODE"
fi
