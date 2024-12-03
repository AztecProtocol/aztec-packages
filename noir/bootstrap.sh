#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source

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

github_group "noir build"
NATIVE_HASH=$(cache_content_hash .rebuild_patterns_native)
# Fake this so artifacts have a consistent hash in the cache and not git hash dependent
export COMMIT_HASH="$(echo "$NATIVE_HASH" | sed 's/-.*//g')"
if ! cache_download noir-nargo-$NATIVE_HASH.tar.gz || ! ./noir-repo/target/release/nargo --version >/dev/null 2>&1 ; then
  # Continue with native bootstrapping if the cache was not used or nargo verification failed.
  denoise ./scripts/bootstrap_native.sh
  cache_upload noir-nargo-$NATIVE_HASH.tar.gz noir-repo/target/release/nargo noir-repo/target/release/acvm
fi
PACKAGES_HASH=$(cache_content_hash ../barretenberg/cpp/.rebuild_patterns ../barretenberg/ts/.rebuild_patterns .rebuild_patterns_packages .rebuild_patterns_native)
if ! cache_download noir-packages-$PACKAGES_HASH.tar.gz ; then
  denoise ./scripts/bootstrap_packages.sh
  cache_upload noir-packages-$PACKAGES_HASH.tar.gz packages
fi
github_endgroup

TEST_FLAG=noir-test-$NATIVE_HASH-$PACKAGES_HASH-$(cache_content_hash .rebuild_patterns_tests)
if test_should_run $TEST_FLAG; then
  github_group "noir test"
  export PATH="$PWD/noir-repo/target/release/:$PATH"
  denoise ./scripts/test_native.sh
  denoise ./scripts/test_js_packages.sh
  cache_upload_flag $TEST_FLAG
  github_endgroup
fi
