#!/usr/bin/env bash
set -eu

# Commands related to syncing with the noir-repo.

# Special message we use to indicate the commit we do with a fixup.
PATCH_COMMIT_MSG="Noir local patch commit."

cd $(dirname $0)/..

# Read the commitish from the marker that we have to check out.
function read_wanted_ref {
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
  git -C noir-repo fetch origin
  # Try to check out an existing branch, or remote commit.
  if git -C noir-repo checkout $ref; then
    # If it's a branch we just need to pull the latest changes.
    if is_on_branch; then
      git -C noir-repo pull --rebase
    fi
  else
    # If the checkout failed, then it must be a remote branch
    git -C noir-repo checkout --track origin/$ref
  fi
  # If we haven't applied the patch yet, we have to do it (again).
  if ! is_last_commit_patch; then
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
    fi
    # If the last thing we checked out was the commit we wanted, then we're okay.
    # TODO: If we checked out a tag, it may have been moved, in which case we'd need to check out again.
    return
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
  if ! is_detached_head; then
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
