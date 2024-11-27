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
    ./bootstrap_cache.sh && ./noir-repo/target/release/nargo --version >/dev/null 2>&1 && exit 0
fi

$ci3/github/group "noir build"
# Continue with native bootstrapping if the cache was not used or nargo verification failed.
./scripts/bootstrap_native.sh
export AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns_native
$ci3/cache/upload noir-nargo-$($ci3/cache/content_hash).tar.gz noir-repo/target/release/nargo noir-repo/target/release/acvm

./scripts/bootstrap_packages.sh
export AZTEC_CACHE_REBUILD_PATTERNS="../barretenberg/cpp/.rebuild_patterns ../barretenberg/ts/.rebuild_patterns .rebuild_patterns_packages"
$ci3/cache/upload noir-packages-$($ci3/cache/content_hash).tar.gz packages
$ci3/github/endgroup

if [ "${CI:-0}" -eq 1 ]; then
  export PATH="$PWD/noir-repo/target/release/:$PATH"
  $ci3/github/group "noir test"
  ./scripts/test_native.sh
  ./scripts/test_js_packages.sh
  $ci3/github/endgroup
fi
