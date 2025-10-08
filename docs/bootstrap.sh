#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export BB=${BB:-../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-../noir/noir-repo/target/release/nargo}
export TRANSPILER=${TRANSPILER:-../avm-transpiler/target/release/avm-transpiler}
export BB_HASH=${BB_HASH:-$(../barretenberg/cpp/bootstrap.sh hash)}
export NOIR_HASH=${NOIR_HASH:-$(../noir/bootstrap.sh hash)}

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
  npm_install_deps
  if cache_download docs-$hash.tar.gz; then
    return
  fi
  denoise "yarn build"
  cache_upload docs-$hash.tar.gz build
}

function test_cmds {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    # Not running docs tests for arm64 in CI.
    return
  fi

  local test_hash=$hash
  echo "$test_hash cd docs && yarn spellcheck"
}

function test {
  echo_header "docs test"
  test_cmds | parallelize
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "ci")
    DOCS_WORKING_DIR="$(pwd)" ../noir-projects/noir-contracts/bootstrap.sh compile
    build_docs
    test
    ;;
  ""|"full"|"fast")
    build_docs
    ;;
  "hash")
    echo "$hash"
    ;;
  "compile")
    shift
    DOCS_WORKING_DIR="$(pwd)" ../noir-projects/noir-contracts/bootstrap.sh compile
    ;;
  test|test_cmds)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
