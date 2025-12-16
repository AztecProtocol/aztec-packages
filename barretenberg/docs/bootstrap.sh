#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

# We search the docs/*.md files to find included code, and use those as our rebuild dependencies.
# We prefix the results with ^ to make them "not a file", otherwise they'd be interpreted as pattern files.
hash=$(
  cache_content_hash \
    .rebuild_patterns \
    $(find docs versioned_docs -type f -name "*.md*" -exec grep '^#include_code' {} \; 2>/dev/null | \
      awk '{ gsub("^/", "", $3); print "^" $3 }' | sort -u)
)

if semver check $REF_NAME; then
  # Ensure that released versions don't use cache from non-released versions (they will have incorrect links to master)
  hash+=$REF_NAME
  export COMMIT_TAG=$REF_NAME
fi

function build {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    echo "Not building bb docs for arm64 in CI."
    return
  fi
  echo_header "build bb docs"
  if cache_download bb-docs-$hash.tar.gz; then
    echo "Skipping deployment - no bb doc changes compared to cache."
    return
  fi
  denoise "yarn install && yarn build"
  cache_upload bb-docs-$hash.tar.gz build
}

function test_cmds {
  echo "$hash barretenberg/docs/bootstrap.sh test"
}

function test {
  echo_header "test docs"

  denoise "yarn install"
  denoise "yarn test"
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"full"|"fast"|"ci")
    build
    ;;
  "hash")
    echo "$hash"
    ;;
  "test_cmds")
    test_cmds
    ;;
  "test")
    test
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
