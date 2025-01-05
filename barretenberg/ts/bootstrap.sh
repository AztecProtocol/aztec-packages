#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
hash=$(cache_content_hash ../cpp/.rebuild_patterns .rebuild_patterns)

function build {
  echo_header "bb.js build"
  denoise "yarn install"

  if ! cache_download bb.js-$hash.tar.gz; then
    find . -exec touch -d "@0" {} + 2>/dev/null || true
    denoise "yarn build"
    cache_upload bb.js-$hash.tar.gz dest
  fi
}

function test_cmds {
  for test in src/**/*.test.ts; do
    echo "$hash barretenberg/ts/scripts/run_test.sh $test"
  done
}

function test {
  echo_header "bb.js test"
  test_cmds | parallelise
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast"|"full")
    build
    ;;
  "test")
    test
    ;;
  "test-cmds")
    test_cmds
    ;;
  "hash")
    echo "$hash"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac