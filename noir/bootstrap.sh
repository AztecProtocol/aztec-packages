#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
hash=$(cache_content_hash .rebuild_patterns)

function build {
  github_group "noir build"
  # Downloads and checks for valid nargo and packages.
  if ! cache_download noir-$hash.tar.gz; then
    # Fake this so artifacts have a consistent hash in the cache and not git hash dependent
    export COMMIT_HASH="$(echo "$hash" | sed 's/-.*//g')"
    parallel denoise ::: ./scripts/bootstrap_native.sh ./scripts/bootstrap_packages.sh
    cache_upload noir-$hash.tar.gz noir-repo/target/release/nargo noir-repo/target/release/acvm packages
  fi
  github_endgroup
}

function test_hash() {
  hash_str $hash-$(cache_content_hash .rebuild_patterns_tests)
}
function test {
  test_flag=noir-test-$(test_hash)
  if test_should_run $test_flag; then
    github_group "noir test"
    export COMMIT_HASH="$(echo "$hash" | sed 's/-.*//g')"
    export PATH="$PWD/noir-repo/target/release/:$PATH"
    parallel --tag --line-buffered --timeout 5m --halt now,fail=1 \
      denoise ::: ./scripts/test_native.sh ./scripts/test_js_packages.sh
    cache_upload_flag $test_flag
    github_endgroup
  fi
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full")
    build
    ;;
  "test")
    test
    ;;
  "ci")
    build
    test
    ;;
  "hash")
    echo $hash
    ;;
  "hash-test")
    test_hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
