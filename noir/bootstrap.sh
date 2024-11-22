#!/usr/bin/env bash
set -eu

cd $(dirname "$0")

CMD=${1:-}

export PATH=$PWD/../build-system/s3-cache-scripts:$PATH

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

# Continue with native bootstrapping if the cache was not used or nargo verification failed.
./scripts/bootstrap_native.sh
export AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns_native
cache-upload.sh noir-nargo-$(compute-content-hash.sh).tar.gz noir-repo/target/release/nargo noir-repo/target/release/acvm

./scripts/bootstrap_packages.sh
export AZTEC_CACHE_REBUILD_PATTERNS="../barretenberg/cpp/.rebuild_patterns ../barretenberg/ts/.rebuild_patterns .rebuild_patterns_packages"
cache-upload.sh noir-packages-$(compute-content-hash.sh).tar.gz packages

if [ "${CI:-0}" -eq 1 ]; then
  export PATH="$PWD/noir-repo/target/release/:$PATH"

  ./scripts/test_native.sh
  ./scripts/test_js_packages.sh
fi