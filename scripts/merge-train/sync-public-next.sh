#!/usr/bin/env bash

set -euo pipefail

REMOTE="${REMOTE:-origin}"
PUBLIC_BRANCH="${PUBLIC_BRANCH:-public-next}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_REPO="${UPSTREAM_REPO:-https://github.com/AztecProtocol/aztec-packages.git}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-next}"
DRY_RUN="${DRY_RUN:-0}"

PRESERVE_PATHS=(
  ".github/workflows/public-next-pr-body.yml"
  ".github/workflows/public-next-to-next.yml"
  ".github/workflows/sync-upstream-next.yml"
  "scripts/merge-train/merge-public-next.sh"
  "scripts/merge-train/sync-public-next.sh"
  "scripts/merge-train/update-public-next-pr-body.sh"
)

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

sync_branch="${PUBLIC_BRANCH}-sync"
git checkout --force -B "$sync_branch" "$upstream_ref"

for path in "${PRESERVE_PATHS[@]}"; do
  if git cat-file -e "${public_ref}:${path}" 2>/dev/null; then
    git checkout "$public_ref" -- "$path"
    git add "$path"
  else
    git rm --quiet --ignore-unmatch "$path"
  fi
done

new_tree=$(git write-tree)
old_tree=$(git rev-parse "${public_ref}^{tree}")

if [[ "$new_tree" == "$old_tree" ]]; then
  echo "$PUBLIC_BRANCH already mirrors ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} with preserved automation"
  exit 0
fi

echo "Prepared $PUBLIC_BRANCH sync:"
echo "  public:   $public_sha"
echo "  upstream: $upstream_sha"
git diff --stat "$public_ref" HEAD

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1; not committing or pushing"
  exit 0
fi

new_commit=$(git commit-tree "$new_tree" \
  -p "$public_sha" \
  -p "$upstream_sha" \
  -m "chore: sync public-next with upstream next")

git update-ref "refs/heads/${PUBLIC_BRANCH}" "$new_commit"
git push "$REMOTE" "refs/heads/${PUBLIC_BRANCH}:refs/heads/${PUBLIC_BRANCH}"

echo "Pushed $PUBLIC_BRANCH sync commit $new_commit"
