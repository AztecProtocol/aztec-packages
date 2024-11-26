#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

CMD=${1:-}
BUILD_CMD="build"

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -fdx
    exit 0
  elif [ "$CMD" = "esm" ]; then
    BUILD_CMD="build:esm"
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

# Attempt to just pull artefacts from CI and exit on success.
[ -n "${USE_CACHE:-}" ] && ./bootstrap_cache.sh && exit

yarn install

[ -n "${GITHUB_ACTIONS:-}" ] && echo "::group::bb.js build"
echo "Building with command 'yarn $BUILD_CMD'..."
yarn $BUILD_CMD
echo "Barretenberg ts build successful"

export PATH=$PWD/../../build-system/s3-cache-scripts:$PATH
export AZTEC_CACHE_REBUILD_PATTERNS="../cpp/.rebuild_patterns .rebuild_patterns"
cache-upload.sh bb.js-$(compute-content-hash.sh).tar.gz dest
[ -n "${GITHUB_ACTIONS:-}" ] && echo "::endgroup::"

if [ "${CI:-0}" -eq 1 ]; then
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::group::bb.js test"
  yarn test
[ -n "${GITHUB_ACTIONS:-}" ] && echo "::endgroup::"
fi
