#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

CMD=${1:-}

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -fdx
    exit 0
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

$ci3/github/group "noir build"
NATIVE_HASH=$($ci3/cache/content_hash .rebuild_patterns_native)
if ! $ci3/cache/download noir-nargo-$NATIVE_HASH.tar.gz || ! ./noir-repo/target/release/nargo --version >/dev/null 2>&1 ; then
  # Continue with native bootstrapping if the cache was not used or nargo verification failed.
  denoise ./scripts/bootstrap_native.sh
  $ci3/cache/upload noir-nargo-$NATIVE_HASH.tar.gz noir-repo/target/release/nargo noir-repo/target/release/acvm
fi
PACKAGES_HASH=$($ci3/cache/content_hash ../barretenberg/cpp/.rebuild_patterns ../barretenberg/ts/.rebuild_patterns .rebuild_patterns_packages)
if ! $ci3/cache/download noir-packages-$PACKAGES_HASH.tar.gz ; then
  denoise ./scripts/bootstrap_packages.sh
  $ci3/cache/upload noir-packages-$PACKAGES_HASH.tar.gz packages
fi
$ci3/github/endgroup

TEST_HASH=$($ci3/cache/content_hash .rebuild_patterns_tests)
if $ci3/cache/should_run noir-test-$TEST_HASH; then
  $ci3/github/group "noir test"
  export PATH="$PWD/noir-repo/target/release/:$PATH"
  denoise ./scripts/test_native.sh
  denoise ./scripts/test_js_packages.sh
  $ci3/cache/upload_flag noir-test-$NATIVE_HASH-$PACKAGES_HASH
  $ci3/github/endgroup
fi
