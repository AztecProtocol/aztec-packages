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

$ci3/github/group "bb.js build"
$ci3/base/denoise yarn install
find . -exec touch -d "@0" {} + 2>/dev/null || true

echo "Building with command 'yarn $BUILD_CMD'..."
$ci3/base/denoise yarn $BUILD_CMD
export AZTEC_CACHE_REBUILD_PATTERNS="../cpp/.rebuild_patterns .rebuild_patterns"
HASH=$($ci3/cache/content_hash)
$ci3/cache/upload bb.js-$HASH.tar.gz dest
echo "Barretenberg ts build successful"
$ci3/github/endgroup

if $ci3/cache/should_run bb.js-$HASH; then
  $ci3/github/group "bb.js test"
  yarn test
  $ci3/cache/upload_flag bb.js-$HASH
  $ci3/github/endgroup
fi
