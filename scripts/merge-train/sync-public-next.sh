#!/usr/bin/env bash

set -euo pipefail

REMOTE="${REMOTE:-origin}"
PUBLIC_BRANCH="${PUBLIC_BRANCH:-public-next}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_REPO="${UPSTREAM_REPO:-https://github.com/AztecProtocol/aztec-packages.git}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-next}"
DRY_RUN="${DRY_RUN:-0}"

function require_command {
  local command="$1"
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
}

function configure_upstream_remote {
  if git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
    git remote set-url "$UPSTREAM_REMOTE" "$UPSTREAM_REPO"
  else
    git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_REPO"
  fi
}

require_command git

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty; refusing to sync $PUBLIC_BRANCH" >&2
  exit 1
fi

configure_upstream_remote
git fetch "$REMOTE" "$PUBLIC_BRANCH" --no-tags
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH" --no-tags

public_ref="${REMOTE}/${PUBLIC_BRANCH}"
upstream_ref="${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"
public_sha=$(git rev-parse "$public_ref")
upstream_sha=$(git rev-parse "$upstream_ref")

if git merge-base --is-ancestor "$upstream_sha" "$public_ref"; then
  echo "$PUBLIC_BRANCH already contains ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} ($upstream_sha)"
  exit 0
fi

git checkout --force -B "$PUBLIC_BRANCH" "$public_ref"

echo "Merging ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} into $PUBLIC_BRANCH:"
echo "  public:   $public_sha"
echo "  upstream: $upstream_sha"

if [[ "$DRY_RUN" == "1" ]]; then
  if git merge "$upstream_ref" --no-edit --no-commit; then
    echo "DRY_RUN=1; merge applies cleanly, not committing or pushing"
    git merge --abort >/dev/null 2>&1 || git reset --hard "$public_ref" >/dev/null
    exit 0
  fi

  conflicts=$(git diff --name-only --diff-filter=U)
  git merge --abort || true
  echo "DRY_RUN=1; merge conflicts detected:"
  echo "$conflicts"
  exit 1
fi

if git merge "$upstream_ref" --no-edit -m "chore: sync ${PUBLIC_BRANCH} with upstream ${UPSTREAM_BRANCH}"; then
  git push "$REMOTE" "$PUBLIC_BRANCH"
  echo "Pushed $PUBLIC_BRANCH sync commit $(git rev-parse HEAD)"
  exit 0
fi

conflicts=$(git diff --name-only --diff-filter=U)
git merge --abort || true

echo "Merge conflicts detected while syncing ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} into $PUBLIC_BRANCH:"
echo "$conflicts"
exit 1
