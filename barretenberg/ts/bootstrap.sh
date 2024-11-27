#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

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

$ci3/yarn/install

$ci3/github/group "bb.js build"
echo "Building with command 'yarn $BUILD_CMD'..."
yarn $BUILD_CMD
echo "Barretenberg ts build successful"
$ci3/github/endgroup

if [ "${CI:-0}" -eq 1 ]; then
  $ci3/github/group "bb.js test"
  yarn test
  export AZTEC_CACHE_REBUILD_PATTERNS="../cpp/.rebuild_patterns .rebuild_patterns"
  $ci3/cache/upload bb.js-$($ci3/cache/content_hash).tar.gz dest
  $ci3/github/endgroup
fi
