#!/usr/bin/env bash
set -eu
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
cd "$(dirname "$0")"
ci3="$(git rev-parse --show-toplevel)/ci3"

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

GITHUB_ACTIONS="" yarn install

$ci3/github/group "bb.js build"
echo "Building with command 'yarn $BUILD_CMD'..."
yarn $BUILD_CMD
echo "Barretenberg ts build successful"
$ci3/github/endgroup

if [ "${CI:-0}" -eq 1 ]; then
  $ci3/github/group "bb.js test"
  yarn test
  export AZTEC_CACHE_REBUILD_PATTERNS="../cpp/.rebuild_patterns .rebuild_patterns"
  $ci3/cache/upload bb.js-$(compute-content-hash.sh).tar.gz dest
  $ci3/github/endgroup
fi
