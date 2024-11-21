#!/usr/bin/env bash
set -eu

cd $(dirname "$0")

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

# Continue with native bootstrapping if the cache was not used or nargo verification failed.
./scripts/bootstrap_native.sh
./scripts/bootstrap_packages.sh

if [ "${CI:-0}" -eq 1 ]; then
  export PATH="$PWD/noir-repo/target/release/:$PATH"

  ./scripts/test_native.sh
  ./scripts/test_js_packages.sh
fi