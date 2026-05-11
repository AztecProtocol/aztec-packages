#!/usr/bin/env bash

set -euo pipefail

REMOTE="${REMOTE:-origin}"
SOURCE_BRANCH="${SOURCE_BRANCH:-public-next}"
TARGET_BRANCH="${TARGET_BRANCH:-next}"
CONFLICT_EXIT_CODE="${CONFLICT_EXIT_CODE:-1}"

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

echo "Merging $SOURCE_BRANCH ($source_sha) into $TARGET_BRANCH ($target_sha)"

if git merge "$source_ref" --no-edit -m "chore: merge ${SOURCE_BRANCH} into ${TARGET_BRANCH}"; then
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
