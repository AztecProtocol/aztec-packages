#!/usr/bin/env bash
set -eu

# Commands related to syncing with the noir-repo.

# Special message we use to indicate the commit we do after the fixup.
# This commit has changes we do *not* want to migrate back to Noir,
# they exist only to make the Noir codebase work with the projects
# in aztec-packages, rather than their released versions.
FIXUP_COMMIT_MSG="Noir local fixup commit."
# Special message we use to indicate the commit we do after applying
# any patch file committed in aztec-packages, which contains changes
# Aztec developer made to Noir. These are changes we do want to see
# migrated back to Noir eventually, after which the patch file can
# be removed.
PATCH_COMMIT_MSG="Noir local patch commit."
# We either have a patch file or we don't - once applied, any further
# if we add new commits and create a new patch, we can override it
# so that it includes all previous patches.
NOIR_REPO_PATCH=noir-repo.patch
# Certain commands such as `noir/bootstrap.sh test_cmds` are expected to print
# executable scripts, which would be corrupted by any extra logs coming from here.
NOIR_REPO_VERBOSE=${NOIR_REPO_VERBOSE:-0}

cd $(dirname $0)/..

function log {
  if [ "${NOIR_REPO_VERBOSE}" -eq 1 ]; then
    echo $@
  fi
}

# Read the commitish that we have to check out from the marker file
# or an env var to facilitate overriding it on CI for nightly tests.
function read_wanted_ref {
  ref=${NOIR_REPO_REF:-}
  if [ ! -z "$ref" ]; then
    echo $ref
    return
  fi
  cat noir-repo-ref
}

# Return the current branch name, or fail if we're not on a branch.
function branch_name {
  git -C noir-repo symbolic-ref --short -q HEAD
}

# Check if we are on a branch.
function is_on_branch {
  test $(branch_name)
}

# Check if we are on a detached HEAD, which means if we switch branches
# it would be difficult to recover any changes committed on this branch.
function is_detached_head {
  ! is_on_branch
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

# Check if we have applied the fixup in any commit in the log.
# It is possible that we checkout a branch, apply the patch, then go into noir-repo
# and work on various fixes, committing them as we go. In that case the patch won't
# be the last commit, but it doesn't have to be applied again if we switch away
# from our branch and then come back to it later.
function has_patch_commit {
  if git -C noir-repo rev-list --no-commit-header --format=%B HEAD | grep -q --max-count=1 "$PATCH_COMMIT_MSG" ; then
    return 0 # true
  else
    return 1 # false
  fi
}

# Find the commit hash of the last applied fixup commit.
# This is a commit we don't want to include in a patch file.
function find_fixup_commit {
  git -C noir-repo log --oneline --no-abbrev-commit --grep "$FIXUP_COMMIT_MSG" --max-count=1 | awk '{print $1}'
}

# Find the commit hash of the last checkout.
function find_checkout_commit {
  git -C noir-repo rev-parse "$(find_fixup_commit)~1"
}

# Check if a ref is a tag we have locally
function has_tag {
  tag=$1
  test $(git -C noir-repo tag --list $tag)
}

# Get the commit a tag *currently* refers to on the remote and check if we have it in our local history.
function has_tag_commit {
  tag=$1
  rev=$(git -C noir-repo ls-remote --tags origin $1 | awk '{print $1}')
  if [ ! -z "$rev" ]; then
    # NB `git show` would tell if we have the commit, but it would not necessarily be an ancestor.
    if git -C noir-repo log --oneline --no-abbrev-commit | grep -q --max-count=1 "$rev"; then
      return 0
    fi
  fi
  return 1
}

# Indicate that the `make-patch` command should be used to create a new patch file.
function needs_patch {
  is_detached_head && ! is_last_commit_patch
}

# Indicate that we have to switch to the wanted branch.
function needs_switch {
  want=$(read_wanted_ref)
  # Are we on the wanted branch?
  if is_on_branch && [ "$(branch_name)" == "$want" ]; then
    return 1
  fi
  # Are we descending from the wanted commit?
  if [ "$(find_checkout_commit)" == "$want" ]; then
    return 1
  fi
  # Are we descending from the wanted tag?
  if has_tag "$want" && has_tag_commit "$want"; then
    return 1
  fi
  return 0 # true
}

# Create an empty marker commit to show that patches have been applied or put in a patch file.
function commit_patch_marker {
  git -C noir-repo commit -m "$PATCH_COMMIT_MSG" --allow-empty
}

# Apply the fixup script and any local patch file.
function patch_repo {
  log Applying fixup on noir-repo
  # Redirect the `bb` reference to the local one.
  scripts/sync-in-fixup.sh
  git -C noir-repo add . && git -C noir-repo commit -m "$FIXUP_COMMIT_MSG" --allow-empty
  # Apply any patch file.
  if [ -f $NOIR_REPO_PATCH ]; then
    log Applying patches from $NOIR_REPO_PATCH
    git -C noir-repo am ../$NOIR_REPO_PATCH
  else
    log "No patch file to apply"
  fi
  # Create an empty marker commit to show that patches have been applied.
  commit_patch_marker
}

# Clone the repository if it doesn't exist.
function init_repo {
  if [ ! -d noir-repo ]; then
    url=https://github.com/noir-lang/noir.git
    ref=$(read_wanted_ref)
    log Initializing noir-repo to $ref
    # If we're cloning from a tag with --depth=1, we won't be able to switch to a branch later.
    # On CI we won't be switching branches, but on dev machines we can, so there make a full checkout.
    depth=$([ ! -z "${CI_FULL:-}" ] && echo "--depth 1" || echo "")
    # `--branch` doesn't work for commit hashes
    git clone $depth --branch $ref $url noir-repo \
    || git clone $url noir-repo && git -C noir-repo checkout $ref
    patch_repo
  fi
}

# Check out a tag, branch or commit.
function switch_repo {
  ref=$1
  log Switching noir-repo to $ref
  git -C noir-repo fetch --tags --depth 1 origin
  # If we try to switch to some random commit after a branch it might not find it locally.
  git -C noir-repo fetch --depth 1 origin $ref || true
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
  if ! has_patch_commit; then
    patch_repo
  else
    log "Patches already applied"
  fi
}

# Bring the noir-repo in line with the commit marker.
function update_repo {
  want=$(read_wanted_ref)
  if ! needs_switch; then
    log "noir-repo already on $want"
    if is_on_branch; then
      # If we're on a branch, then we there might be new commits.
      # Rebasing so our local patch commit ends up on top.
      # Quiet so we don't interfere with `test_cmds`
      git -C noir-repo pull --rebase --quiet
      return
    elif ! has_tag $want; then
      # We are on what we wanted and it's _not_ a tag, so it must be a commit, and we have nothing more to do.
      return
    elif has_tag_commit $want; then
      # We checked out a tag, and it looks like it hasn't been moved to a different commit.
      return
    else
      log "The current commit of the tag doesn't appear in our history."
    fi
  fi

  # We need to switch branches.

  if has_uncommitted_changes; then
    echo "Warning: noir-repo has uncommitted changes which could get lost if we switch to $want"
    echo "Please commit these changes and consider pushing them upstream to make sure they are not lost."
    exit 1
  fi

  if needs_patch; then
    echo "Warning: noir-repo is on a detached HEAD and the last commit is not the patch marker commit;"
    echo "switching from to $want could meand losing those commits."
    echo "Please use the 'make-patch' command to create a $NOIR_REPO_PATCH file and commit it in aztec-packages, "
    echo "so that it is applied after each checkout; make sure to commit the patch on the branch where it should be."
    exit 1
  fi

  switch_repo $want
}

# Create a patch file from any outstanding commits in noir-repo
function make_patch {
  if is_last_commit_patch; then
    echo "The last commit is the patch commit, there is nothing new to put in a patch."
    exit 0
  fi
  fixup_rev=$(find_fixup_commit)
  if [ -z "$fixup_rev" ]; then
    echo "Could not determine the fixup commit hash, which is the commit we would like to apply patches from"
    exit 1
  fi
  mkdir -p patches
  # The patch marker commit could be in the middle: fixup-commit from-patch-1 from-patch-2 patch-commit new-fix-1 new-fix-2
  # wo we write all patches to files, then exclude the one which is just the empty patch commit.
  git -C noir-repo format-patch -o ../patches $fixup_rev..HEAD
  # In theory we should be able to apply empty patches `git am --allow-empty`, but it seems to choke on them,
  # so we only keep non-empty patches, which conveniently also excludes `000*-Noir-local-patch-commit.patch` as well.
  rm -f $NOIR_REPO_PATCH
  for patch in $(find patches -name "*.patch"); do
    # --- seems to separtate the files in a patch; in an empty patch it does not appear
    if cat $patch | grep -q "\-\-\-" ; then
      cat $patch >> $NOIR_REPO_PATCH
    fi
  done
  rm -rf patches
  # Create an empty patch marker commit at the end to show that it is safe to switch now.
  if ! is_last_commit_patch; then
    commit_patch_marker
  fi
}

# Show debug information
function info {
  function pad {
    printf "%$2.${2#-}s" "$1";
  }
  function echo_info {
    echo "$(pad "$1:" -25)" $2
  }
  function yesno {
    $@ && echo "yes" || echo "no"
  }
  want=$(read_wanted_ref)
  echo_info "Checkout commit" $(find_checkout_commit || echo "n/a")
  echo_info "Fixup commit" $(find_fixup_commit || echo "n/a")
  echo_info "Wanted" $want
  echo_info "Needs switch" $(yesno needs_switch)
  echo_info "Needs patch" $(yesno needs_patch)
  echo_info "Deteached" $(yesno is_detached_head)
  echo_info "On branch" $(yesno is_on_branch)
  echo_info "Branch name" $(branch_name || echo "n/a")
  echo_info "Has wanted tag" $(yesno has_tag $want)
  echo_info "Has tag commit" $(yesno has_tag_commit $want)
  echo_info "Has patch commit" $(yesno has_patch_commit)
  echo_info "Last commit is patch" $(yesno is_last_commit_patch)
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
  "make-patch")
    make_patch
    ;;
  "needs-patch")
    needs_patch && exit 0 || exit 1
    ;;
  "info")
    info
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
