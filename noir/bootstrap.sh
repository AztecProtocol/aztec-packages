#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
native_hash=$(cache_content_hash .rebuild_patterns_native)
packages_hash=$(cache_content_hash ../barretenberg/cpp/.rebuild_patterns ../barretenberg/ts/.rebuild_patterns .rebuild_patterns_packages .rebuild_patterns_native)

function build {
  github_group "noir build"
  # Fake this so artifacts have a consistent hash in the cache and not git hash dependent
  export COMMIT_HASH="$(echo "$native_hash" | sed 's/-.*//g')"
  if ! cache_download noir-nargo-$native_hash.tar.gz || ! ./noir-repo/target/release/nargo --version >/dev/null 2>&1 ; then
    # Continue with native bootstrapping if the cache was not used or nargo verification failed.
    denoise ./scripts/bootstrap_native.sh
    cache_upload noir-nargo-$native_hash.tar.gz noir-repo/target/release/nargo noir-repo/target/release/acvm
  fi
  if ! cache_download noir-packages-$packages_hash.tar.gz ; then
    denoise ./scripts/bootstrap_packages.sh
    cache_upload noir-packages-$packages_hash.tar.gz packages
  fi
  github_endgroup
}

function test {
  test_flag=noir-test-$(hash_str $native_hash-$packages_hash-$(cache_content_hash .rebuild_patterns_tests))
  if test_should_run $test_flag; then
    github_group "noir test"
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
  *)
    echo "Unknown command: $cmd"
    exit 1
esac