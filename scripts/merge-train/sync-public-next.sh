#!/usr/bin/env bash

# Force-rewrite $PUBLIC_BRANCH so it exactly matches upstream aztec-packages:$UPSTREAM_BRANCH.
#
# $PUBLIC_BRANCH is a pure mirror of the public repo: it carries no private commits, so the sync is
# a hard reset rather than a merge. Bringing upstream into the private $TARGET_BRANCH is a separate
# step (merge-public-next.sh), run after this one.

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

configure_upstream_remote
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH" --no-tags
git fetch "$REMOTE" "$PUBLIC_BRANCH" --no-tags || true

upstream_sha=$(git rev-parse "${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}")
public_sha=$(git rev-parse "${REMOTE}/${PUBLIC_BRANCH}" 2>/dev/null || echo "")

if [[ "$public_sha" == "$upstream_sha" ]]; then
  echo "$PUBLIC_BRANCH already matches ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} ($upstream_sha)"
  exit 0
fi

echo "Force-syncing $PUBLIC_BRANCH to ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}:"
echo "  public:   ${public_sha:-<none>}"
echo "  upstream: $upstream_sha"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1; would force-push $PUBLIC_BRANCH -> $upstream_sha"
  exit 0
fi

git push --force "$REMOTE" "${upstream_sha}:refs/heads/${PUBLIC_BRANCH}"
echo "Force-pushed $PUBLIC_BRANCH to $upstream_sha"
