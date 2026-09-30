#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

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
  npm_install_deps
  if cache_download bb-docs-$hash.tar.gz; then
    echo "Skipping deployment - no bb doc changes compared to cache."
    return
  fi
  denoise "yarn build"
  cache_upload bb-docs-$hash.tar.gz build
}

function test_cmds {
  # The recursive example proves a circuit embedding a full in-circuit Honk verifier in WASM. It takes
  # ~35s on an idle box, but this lane runs alongside the bb build, and when that rebuilds everything
  # the test slows by an order of magnitude (>400s seen on 4 CPUs). The published bb.js it uses is
  # not built from this tree, so that slowdown says nothing about the change under test: budget for
  # it here, and in the test's own jest timeout, rather than fail on it.
  echo "$hash:CPUS=4:TIMEOUT=1500s barretenberg/docs/bootstrap.sh test"
}

function test {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    echo "Not testing bb docs for arm64 in CI."
    return
  fi
  echo_header "test docs"

  denoise "yarn test"
}

case "$cmd" in
  "")
    build
    ;;
  "hash")
    echo "$hash"
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
