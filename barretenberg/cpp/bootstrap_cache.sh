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

$SCRIPTS_PATH/cache-download.sh barretenberg-preset-wasm-$HASH.tar.gz $TMP/build-wasm
$SCRIPTS_PATH/cache-download.sh barretenberg-preset-wasm-threads-$HASH.tar.gz $TMP/build-wasm-threads
$SCRIPTS_PATH/cache-download.sh barretenberg-preset-release-$HASH.tar.gz $TMP/build-release
$SCRIPTS_PATH/cache-download.sh barretenberg-preset-release-world-state-$HASH.tar.gz $TMP/build-world-state

# clobber the existing build with the cached build
mv -f $TMP/build-wasm/build build-wasm/
mv -f $TMP/build-wasm-threads/build build-wasm-threads/
mv -f $TMP/build-release/build build/
mv -f $TMP/build-world-state/build/bin/* build/bin/
