#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

# We search the docs/*.md files to find included code, and use those as our rebuild dependencies.
# We prefix the results with ^ to make them "not a file", otherwise they'd be interpreted as pattern files.
hash=$(
  cache_content_hash \
    .rebuild_patterns \
    $(find docs versioned_docs -type f -name "*.md*" -exec grep '^#include_code' {} \; |
      awk '{ print "^" $1 }' | sort -u)
)

if semver check $REF_NAME; then
  # Ensure that released versions don't use cache from non-released versions (they will have incorrect links to master)
  hash+=$REF_NAME
  export COMMIT_TAG=$REF_NAME
fi

function build_docs {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    echo "Not building docs for arm64 in CI."
    return
  fi
  echo_header "build docs"
  if cache_download docs-$hash.tar.gz; then
    return
  fi
  npm_install_deps
  denoise "yarn build"
  cache_upload docs-$hash.tar.gz build
}


function docs_cut_version {
    echo_header "docs version"

    if [ -z "$1" ]; then
        echo "Usage: $1 <version>"
        exit 1
    fi

    # Store the current branch to return to later
    current_branch=$(git rev-parse --abbrev-ref HEAD)
    echo "Original branch: $current_branch"
    yarn run build

    COMMIT_TAG=$1
    echo "Starting docs versioning for $COMMIT_TAG"
    echo "Checking out tag $COMMIT_TAG..."
    git checkout --force "$COMMIT_TAG"
    git checkout --force "$current_branch" scripts

    # Prepare for docusaurus build/versioning for this tag
    echo "[]" > versions.json # Docusaurus versioning might need this cleared
    echo "Building for $COMMIT_TAG..."
    # Rebuild everything on the tag we checked out (because of include_code links, etc)
    yarn run build

    # Create the versioned docs for this tag
    echo "Creating documentation version for $COMMIT_TAG..."
    # Pass COMMIT_TAG env var specifically if needed by the command
    if ! COMMIT_TAG=$COMMIT_TAG yarn docusaurus docs:version "$COMMIT_TAG"; then
        echo "Error creating docs version for $COMMIT_TAG. Aborting."
        # Go back to original branch and restore stash before exiting
        git checkout "$current_branch"
        if [ $stashed -eq 0 ]; then git stash pop; fi
        exit 1
    fi

    # Checkout the original branch
    echo "Checking out original branch: $current_branch"
    git checkout "$current_branch"

    # Regenerate versions.json based on the *now existing* versioned docs
    echo "Regenerating versions.json on $current_branch..."
    yarn run version::stables

    echo "Docs versioning complete"
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"full"|"fast")
    build_docs
    ;;
  "hash")
    echo "$hash"
    ;;
  "docs-cut-version")
    docs_cut_version "$2"
    ;;
  "release-preview")
    release_preview
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac

