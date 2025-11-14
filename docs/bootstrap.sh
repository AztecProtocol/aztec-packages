#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

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

function check_references {
  echo_header "Check doc references"
  ./scripts/check_doc_references.sh docs
}

function build_examples {
  echo_header "Building examples"
  (cd examples && ./bootstrap.sh "$@")
}

case "$cmd" in
  "ci")
    build_examples
    build_docs
    test
    check_references
    ;;
  "")
    build_examples
    build_docs
    check_references
    ;;
  "hash")
    echo "$hash"
    ;;
  "compile")
    build_examples compile "$@"
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
