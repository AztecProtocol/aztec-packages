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

$SCRIPTS_PATH/cache-download.sh barretenberg-preset-wasm-$HASH.tar.gz $TMP/build-wasm > /dev/null
$SCRIPTS_PATH/cache-download.sh barretenberg-preset-wasm-threads-$HASH.tar.gz $TMP/build-wasm-threads > /dev/null
$SCRIPTS_PATH/cache-download.sh barretenberg-preset-release-$HASH.tar.gz $TMP/build-release > /dev/null
$SCRIPTS_PATH/cache-download.sh barretenberg-preset-release-world-state-$HASH.tar.gz $TMP/build-world-state > /dev/null

mv -n $TMP/build-wasm/build build-wasm/
mv -n $TMP/build-wasm-threads/build build-wasm-threads/
mv -n $TMP/build-release/build build/
mv -n $TMP/build-world-state/build/bin/* build/bin/
