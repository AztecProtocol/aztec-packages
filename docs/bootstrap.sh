#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

# We search the docs/*.md files to find included code, and use those as our rebuild dependencies.
# We prefix the results with ^ to make them "not a file", otherwise they'd be interpreted as pattern files.
hash=$(
  cache_content_hash \
    .rebuild_patterns \
    $(find docs versioned_docs -type f -name "*.md*" -exec grep '^#include_code' {} \; | \
      awk '{ gsub("^/", "", $3); print "^" $3 }' | sort -u)
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

function release_docs {
  echo "deploying docs to prod"
  yarn install
  yarn build

  yarn netlify deploy --site aztec-docs-dev --prod 2>&1
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
  "release-docs")
    release_docs
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
