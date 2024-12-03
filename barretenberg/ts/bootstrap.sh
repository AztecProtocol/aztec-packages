#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source

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
github_group "bb.js build"
HASH=$(cache_content_hash ../cpp/.rebuild_patterns .rebuild_patterns)
if ! cache_download bb.js-$HASH.tar.gz; then
  echo -n "yarn install"
  denoise yarn install
  find . -exec touch -d "@0" {} + 2>/dev/null || true

  echo "Building with command 'yarn $BUILD_CMD'..."
  denoise yarn $BUILD_CMD
  cache_upload bb.js-$HASH.tar.gz dest
else
  echo -n "yarn install (post-cache):"
  denoise yarn install
fi
echo "Barretenberg ts build successful"
github_endgroup

if test_should_run bb.js-tests-$HASH; then
  github_group "bb.js test"
  denoise yarn test
  cache_upload_flag bb.js-tests-$HASH
  github_endgroup
fi
