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

function write_patch_for_commits {
  local patch_file="$1"
  shift

  local commits=("$@")
  local first_commit last_commit base_commit

  [[ "${#commits[@]}" -gt 0 ]] || return 1

  first_commit="${commits[0]}"
  last_commit="${commits[$((${#commits[@]} - 1))]}"
  base_commit=$(first_parent "$first_commit")

  if git merge-base --is-ancestor "$base_commit" "$last_commit"; then
    git diff --binary "$base_commit" "$last_commit" >"$patch_file"
    return 0
  fi

  : >"$patch_file"
  for commit in "${commits[@]}"; do
    git diff --binary "$(first_parent "$commit")" "$commit" >>"$patch_file"
  done
}

function patch_id_for_commits {
  local patch_file patch_id

  patch_file=$(mktemp)
  write_patch_for_commits "$patch_file" "$@"
  patch_id=$(git patch-id --stable <"$patch_file" | awk 'BEGIN { sep = "" } { printf "%s%s", sep, $1; sep = ":" } END { if (sep != "") printf "\n" }')
  rm -f "$patch_file"

  echo "$patch_id"
}

function patch_file_still_present {
  local patch_file="$1"

  [[ -s "$patch_file" ]] || return 1
  git apply --reverse --3way --check "$patch_file" >/dev/null 2>&1
}

function patch_still_present {
  local commit="$1"
  local patch_file

  patch_file=$(mktemp)
  write_patch_for_commits "$patch_file" "$commit"
  local status=0
  if patch_file_still_present "$patch_file"; then
    status=0
  else
    status=$?
  fi
  rm -f "$patch_file"
  return "$status"
}

function patch_unit_still_present {
  local patch_file

  patch_file=$(mktemp)
  write_patch_for_commits "$patch_file" "$@"
  local status=0
  if patch_file_still_present "$patch_file"; then
    status=0
  else
    status=$?
  fi
  rm -f "$patch_file"
  return "$status"
}

function describe_patch_unit {
  local commits=("$@")
  local first_commit last_commit

  first_commit="${commits[0]}"
  last_commit="${commits[$((${#commits[@]} - 1))]}"

  if [[ "${#commits[@]}" -eq 1 ]]; then
    echo "${first_commit:0:10}: $(commit_subject "$first_commit")"
  else
    echo "${first_commit:0:10}..${last_commit:0:10} (${#commits[@]} commits): $(commit_subject "$last_commit")"
  fi
}

function queue_patch_unit {
  local patch_id
  local queued_patch_id
  local commits=("$@")

  [[ "${#commits[@]}" -gt 0 ]] || return

  patch_id=$(patch_id_for_commits "${commits[@]}")
  [[ -n "$patch_id" ]] || return

  for queued_patch_id in "${queued_patch_ids[@]}"; do
    [[ "$queued_patch_id" != "$patch_id" ]] || return
  done

  if ! patch_unit_still_present "${commits[@]}"; then
    return
  fi

  queued_patch_ids+=("$patch_id")
  patch_queue+=("${commits[*]}")
}

current_patch_pr=""
current_patch_commits=()

function flush_patch_group {
  if [[ "${#current_patch_commits[@]}" -gt 0 ]]; then
    queue_patch_unit "${current_patch_commits[@]}"
  fi
  current_patch_pr=""
  current_patch_commits=()
}

function queue_stream_commit {
  local commit="$1"
  local subject pr_number

  subject=$(commit_subject "$commit")
  pr_number=$(pr_for_subject "$subject")

  if [[ -n "$pr_number" ]]; then
    if [[ "$current_patch_pr" == "$pr_number" ]]; then
      current_patch_commits+=("$commit")
    else
      flush_patch_group
      current_patch_pr="$pr_number"
      current_patch_commits=("$commit")
    fi
    return
  fi

  flush_patch_group
  queue_patch_unit "$commit"
}

function collect_private_patch_queue {
  local base="$1"
  local target="$2"
  local commit subject train_commit train_subject

  queued_patch_ids=()
  patch_queue=()
  current_patch_pr=""
  current_patch_commits=()

  while read -r commit; do
    [[ -n "$commit" ]] || continue

    subject=$(commit_subject "$commit")
    if is_public_next_merge "$subject"; then
      flush_patch_group
      continue
    fi

    if is_merge_train "$subject"; then
      flush_patch_group
      while read -r train_commit; do
        [[ -n "$train_commit" ]] || continue
        train_subject=$(commit_subject "$train_commit")
        if [[ "$train_subject" == Merge* && "$train_subject" != *"#"* ]]; then
          flush_patch_group
          continue
        fi
        queue_stream_commit "$train_commit"
      done < <(merge_train_commits "$commit")
      flush_patch_group
      continue
    fi

    if [[ "$subject" == Merge* && "$subject" != *"#"* ]]; then
      flush_patch_group
      continue
    fi

    queue_stream_commit "$commit"
  done < <(git log --reverse --first-parent --format=%H "${base}..${target}")

  flush_patch_group
}

function reapply_patch_commit {
  local commit="$1"
  local parent patch_file author_name author_email author_date committer_name committer_email committer_date commit_msg

  parent=$(first_parent "$commit")
  patch_file=$(mktemp)
  git diff --binary "$parent" "$commit" >"$patch_file"

  if git apply --3way --index "$patch_file"; then
    author_name=$(git show -s --format=%an "$commit")
    author_email=$(git show -s --format=%ae "$commit")
    author_date=$(git show -s --format=%aI "$commit")
    committer_name=$(git show -s --format=%cn "$commit")
    committer_email=$(git show -s --format=%ce "$commit")
    committer_date=$(git show -s --format=%cI "$commit")
    commit_msg=$(git log --format=%B -n1 "$commit")

    GIT_AUTHOR_NAME="$author_name" \
      GIT_AUTHOR_EMAIL="$author_email" \
      GIT_AUTHOR_DATE="$author_date" \
      GIT_COMMITTER_NAME="$committer_name" \
      GIT_COMMITTER_EMAIL="$committer_email" \
      GIT_COMMITTER_DATE="$committer_date" \
      git commit -m "$commit_msg"

    rm -f "$patch_file"
    return 0
  fi

  rm -f "$patch_file"
  return 1
}

function reapply_missing_private_patches {
  local commit patch_commits missing_count=0
  local -a commits

  [[ "$REAPPLY_PRIVATE_PATCHES" == "1" ]] || return 0
  [[ "${#patch_queue[@]}" -gt 0 ]] || return 0

  echo "Verifying ${#patch_queue[@]} private patch groups after merge"

  for patch_commits in "${patch_queue[@]}"; do
    read -r -a commits <<<"$patch_commits"

    if patch_unit_still_present "${commits[@]}"; then
      continue
    fi

    echo "Reapplying private patch group $(describe_patch_unit "${commits[@]}")"
    for commit in "${commits[@]}"; do
      if reapply_patch_commit "$commit"; then
        continue
      fi

      git am --abort >/dev/null 2>&1 || true
      git reset --merge >/dev/null 2>&1 || true

      if patch_still_present "$commit"; then
        continue
      fi

      log_error "Failed to reapply private patch ${commit:0:10}: $(commit_subject "$commit")"
      return 1
    done

    if ! patch_unit_still_present "${commits[@]}"; then
      log_error "Private patch group still missing after reapply: $(describe_patch_unit "${commits[@]}")"
      return 1
    fi

    missing_count=$((missing_count + 1))
  done

  if [[ "$missing_count" -gt 0 ]]; then
    echo "Reapplied $missing_count private patch groups on top of $SOURCE_BRANCH"
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
  echo "Queued ${#patch_queue[@]} content-present private patch groups from $TARGET_BRANCH"
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
