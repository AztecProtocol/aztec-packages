#!/bin/bash
set -eu

SCRIPT_DIR=$(dirname "$(realpath "$0")")

# Check for unstaged changes
if ! git diff-index --quiet HEAD --; then
    echo "Error: You have unstaged changes. Please commit or stash them before running git_subrepo.sh."
    exit 1
fi

SUBREPO_PATH="${2:-}"
if [ -d "$SUBREPO_PATH" ] ; then
    # Read parent commit from .gitrepo file
    parent_commit=$(awk -F'= ' '/parent =/{print $2}' $SUBREPO_PATH/.gitrepo)
    # Check if the parent commit exists in this branch
    if ! git branch --contains $parent_commit | grep -q '\*'; then
        echo "Auto-fixing squashed parent in $SUBREPO_PATH/.gitrepo."

        # Get the commit that last wrote to .gitrepo
        last_commit=$(git log -1 --pretty=format:%H -- "$SUBREPO_PATH/.gitrepo")
        # Get parent of the last commit
        new_parent=$(git log --pretty=%P -n 1 $last_commit)

        # Update parent in .gitrepo file using perl
        perl -pi -e "s/${parent_commit}/${new_parent}/g" "$SUBREPO_PATH/.gitrepo"

        # Commit this change
        git add "$SUBREPO_PATH/.gitrepo"
        git commit -m "git_subrepo.sh: Fix parent in .gitrepo file."
    fi
fi
"$SCRIPT_DIR"/git-subrepo/lib/git-subrepo -x $@

