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

# Attempt to pull artifacts from CI if USE_CACHE is set and verify nargo usability.
if [ -n "${USE_CACHE:-}" ]; then
  if ./bootstrap_cache.sh && ./noir-repo/target/release/nargo --version >/dev/null 2>&1 ; then
    # Cause the is_build checks below to fail
    export USE_BUILD=0
  fi
fi

export AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns_native
NATIVE_HASH=$($ci3/cache/content_hash)

export AZTEC_CACHE_REBUILD_PATTERNS="../barretenberg/cpp/.rebuild_patterns ../barretenberg/ts/.rebuild_patterns .rebuild_patterns_packages"
PACKAGES_HASH=$($ci3/cache/content_hash)

if $ci3/base/is_build; then
  $ci3/github/group "noir build"
  # Continue with native bootstrapping if the cache was not used or nargo verification failed.
  ./scripts/bootstrap_native.sh
  $ci3/cache/upload noir-nargo-$NATIVE_HASH.tar.gz noir-repo/target/release/nargo noir-repo/target/release/acvm

  ./scripts/bootstrap_packages.sh
  $ci3/cache/upload noir-packages-$PACKAGES_HASH.tar.gz packages
  $ci3/github/endgroup
fi

if $ci3/base/is_test && $ci3/cache/should_run noir-test-$NATIVE_HASH-$PACKAGES_HASH  ; then
  $ci3/github/group "noir test"
  export PATH="$PWD/noir-repo/target/release/:$PATH"
  ./scripts/test_native.sh
  ./scripts/test_js_packages.sh
  $ci3/cache/upload_flag noir-test-$NATIVE_HASH-$PACKAGES_HASH
  $ci3/github/endgroup
fi
