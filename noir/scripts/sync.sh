#!/usr/bin/env bash
set -eu

# Commands related to syncing with the noir-repo.

# Special message we use to indicate the commit we do with a fixup.
PATCH_COMMIT_MSG="Noir local patch commit."

cd $(dirname $0)/..

# Read the commitish that we have to check out from the marker file
# or an env var to facilitate overriding it on CI for nightly tests.
function read_wanted_ref {
  if [ ! -z "${NOIR_REPO_REF}" ]; then
    echo $NOIR_REPO_REF
    return
  fi
  cat noir-repo-ref
}

# Read the commitish that we last checked out.
function read_last_ref {
  cat .noir-repo-last-ref
}

# Write the last ref we checked out to a file. This will be the same
# value as in `noir-repo-ref`. Having this file makes it easier to
# decide if we need to a new checkout after we have potentially added
# new commits on top of `noir-repo-ref`.
function write_last_ref {
  echo $1 > .noir-repo-last-ref
}

# Check if we are on a branch.
function is_on_branch {
  test $(git -C noir-repo symbolic-ref -q HEAD)
}

# Check if we are on a detached HEAD, which means if we switch branches
# it would be difficult to recover any changes committed on this branch.
function is_detached_head {
  test ! is_on_branch
}

# Check if noir-repo has uncommitted changes.
function has_uncommitted_changes {
  # Add any untracked files, because otherwise we might switch branches,
  # apply the patch fixup, create an artifical commit and inadvertedly
  # add these files to a commit they have nothing to do with.
  if git -C noir-repo add . && \
     git -C noir-repo diff --quiet && \
     git -C noir-repo diff --cached --quiet ; then
    return 1 # false
  else
    return 0 # true
  fi
}

# Check if the last commit is marked with the local patch message.
function is_last_commit_patch {
  last_msg=$(git -C noir-repo rev-list --max-count=1 --no-commit-header --format=%B HEAD)
  test "$last_msg" == "$PATCH_COMMIT_MSG"
}

# Check if a ref is a tag
function is_tag {
  tag=$1
  test $(git -C noir-repo tag --list $tag)
}

# Get the commit a tag *currently* refers to on the remote and check if we have it in our local history.
function has_tag_commit {
  tag=$1
  rev=$(git -C noir-repo ls-remote --tags origin $1 | awk '{print $1}')
  if [ ! -z "$rev" ]; then
    if git -C noir-repo show --oneline "$rev" 1>/dev/null 2>&1; then
      return 0
    fi
  fi
  return 1
}

# Check if we have applied the patch in any commit in the log.
# It is possible that we checkout a branch, apply the patch, then go into noir-repo
# and work on various fixes, committing them as we go. In that case the patch won't
# the the last commit, but it doesn't have to be applied again if we switch away
# from our branch and then come back to it later.
function has_commit_patch {
  if git -C noir-repo rev-list --no-commit-header --format=%B HEAD | grep -q --max-count=1 "$PATCH_COMMIT_MSG" ; then
    return 0 # true
  else
    return 1 # false
  fi
}

# Apply the fixup script and any local patch file.
function fixup_repo {
  echo "Applying patches on noir-repo"
  # Redirect the `bb` reference to the local one.
  scripts/sync-in-fixup.sh
  # TODO: Apply any patch file
  cd noir-repo
  git add . && git commit -m "$PATCH_COMMIT_MSG"
  cd -
}

# Clone the repository if it doesn't exist.
function init_repo {
  if [ ! -d noir-repo ]; then
    url=https://github.com/noir-lang/noir.git
    ref=$(read_wanted_ref)
    echo Initializing noir-repo to $ref
    # `--branch` doesn't work for commit hashes
    git clone --depth 1 --branch $ref $url noir-repo \
    || git clone $url noir-repo && git -C noir-repo checkout $ref
    fixup_repo
    write_last_ref $ref
  fi
}

# Check out a tag, branch or commit.
function switch_repo {
  ref=$1
  echo Switching noir-repo to $ref
  git -C noir-repo fetch --tags --depth 1 origin
  # If we try to switch to some random commit after a branch it might not find it locally.
  git -C noir-repo fetch --depth 1 origin $ref || echo ""
  # Try to check out an existing branch, or remote commit.
  if git -C noir-repo checkout $ref; then
    # If it's a branch we just need to pull the latest changes.
    if is_on_branch; then
      git -C noir-repo pull --rebase
    fi
  else
    # If the checkout failed, then it should be a remote branch or tag
    git -C noir-repo checkout --track origin/$ref
  fi
  # If we haven't applied the patch yet, we have to do it (again).
  if ! has_commit_patch; then
    fixup_repo
  else
    echo "Patches already applied"
  fi
  write_last_ref $ref
}

# Bring the noir-repo in line with the commit marker.
function update_repo {
  want=$(read_wanted_ref)
  have=$(read_last_ref)
  if [ "$want" == "$have" ]; then
    echo "noir-repo already on $want"
    if is_on_branch; then
      # If we're on a branch, then we there might be new commits.
      # Rebasing so our local patch commit ends up on top.
      git -C noir-repo pull --rebase
      return
    elif ! is_tag $want; then
      # If the last thing we checked out was the commit we wanted, then we're okay.
      return
    elif has_tag_commit $want; then
      # We checked out a tag, and it looks like it hasn't been moved to a different commit.
      return
    else
      echo "The current commit of the tag doesn't appear in our history."
    fi
  fi

  # We need to switch branches.

  if has_uncommitted_changes; then
    echo "noir-repo has uncommitted changes which could get lost if we switch from $have to $want"
    echo "Please commit these changes and consider pushing them upstream to make sure they are not lost."
    exit 1
  fi


  if [[ is_detached_head && ! is_last_commit_patch ]]; then
    echo "noir-repo is on a detached HEAD and the last commit is not just the fixup patch."
    echo "Please create a branch and consider pushing it upstream to make sure commits are easy to recover"
    echo "after switching from $have to $want"
    exit 1
  fi

  switch_repo $want
}

function testme {
  if has_tag_commit nightly-2025-03-07; then
    echo "yes"
  else
    echo "no"
  fi
}

cmd=${1:-}
[ -n "$cmd" ] && shift

case "$cmd" in
  "init")
    init_repo
    ;;
  "update")
    update_repo
    ;;
  "testme")
    testme
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
