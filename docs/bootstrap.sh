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

function deploy {
  if [ $(dist_tag) != "latest" ]; then
    do_or_dryrun yarn netlify deploy --site aztec-docs-dev --prod
  else
    release_preview
  fi
}

# If we're an AMD64 CI run and have a PR, do a preview release.
function release_preview {
  echo_header "docs release preview"

  # Deploy and capture exit code and output.
  if ! deploy_output=$(yarn netlify deploy --site aztec-docs-dev 2>&1); then
    echo "Netlify deploy failed with error:"
    echo "$deploy_output"
    exit 1
  fi

  # Extract preview URL.
  local docs_preview_url=$(echo "$deploy_output" | grep -E "https://.*aztec-docs-dev.netlify.app" | awk '{print $4}')
  if [ -z "$docs_preview_url" ]; then
    echo "Failed to extract preview URL from Netlify output."
  else
    echo "Docs preview URL: ${docs_preview_url}"
  fi

  local pr_number=$(gh pr list --head "$REF_NAME" --json number --jq '.[0].number')
  if [ -n "$pr_number" ]; then
    if [ -z "${GITHUB_TOKEN:-}" ]; then
      echo_stderr "Not updating docs preview comment; no PR number."
      return
    fi
    # We remove color from the URL before passing.
    scripts/docs_preview_comment.sh $GITHUB_TOKEN $pr_number "$(echo $docs_preview_url | sed -r 's/\x1B\[[0-9;]*[a-zA-Z]//g')"
  fi
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


    # Rebuilding docs at the tip
    rm -rf processed-docs processed-docs-cache build
    yarn preprocess
    yarn run build

    COMMIT_TAG=$1
    echo "Starting docs versioning for $COMMIT_TAG"
    echo "Processing tag: $COMMIT_TAG"

    # Checkout the tag, discarding local changes from previous build artifacts
    # Use --force to overwrite potentially modified tracked files from the build process
    echo "Checking out tag $COMMIT_TAG..."
    git checkout --force "$COMMIT_TAG" docs src

    # Prepare for docusaurus build/versioning for this tag
    echo "[]" > versions.json # Docusaurus versioning might need this cleared
    echo "Running preprocess and build for $COMMIT_TAG..."

    rm -rf processed-docs processed-docs-cache build

    # Rebuild everything on the tag we checked out (because of include_code links, etc)
    ../bootstrap.sh
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

    trap - EXIT

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
    deploy
    ;;
  "hash")
    echo "$hash"
    ;;
  "docs-cut-version")
    build_docs
    docs_cut_version "$2"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac

