#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

echo -e "\033[1mRetrieving bb binary from remote cache...\033[0m"

SCRIPTS_PATH=../../build-system/s3-cache-scripts/
HASH=$(AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns $SCRIPTS_PATH/compute-content-hash.sh)
TMP=$(mktemp -d)

function on_exit() {
  rm -rf "$TMP"
}
trap on_exit EXIT

# Parallel download of all the cached builds because they're quite big
echo "
barretenberg-preset-wasm
barretenberg-preset-wasm-threads
barretenberg-preset-release
barretenberg-preset-release-world-state
" | xargs --max-procs 0 -I {} bash -c "$SCRIPTS_PATH/cache-download.sh {}-$HASH.tar.gz $TMP/{}"

# # clobber the existing build with the cached build
cp -r $TMP/barretenberg-preset-wasm/build build-wasm/
cp -r $TMP/barretenberg-preset-wasm-threads/build build-wasm-threads/

mkdir -p build
cp -r $TMP/barretenberg-preset-release/build/* build/
cp -r $TMP/barretenberg-preset-release-world-state/build/* build/
