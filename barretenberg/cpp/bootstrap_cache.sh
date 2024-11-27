#!/usr/bin/env bash
set -eu
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

echo -e "\033[1mRetrieving bb binary from remote cache...\033[0m"

export AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns
HASH=$($ci3/cache/content_hash)
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
" | xargs --max-procs 0 -I {} bash -c "$ci3/cache/download {}-$HASH.tar.gz $TMP/{}"

mkdir -p build && cp -r $TMP/barretenberg-preset-release/build/* build/
mkdir -p build-pic && cp -r $TMP/barretenberg-preset-release-world-state/build-pic/* build-pic/
mkdir -p build-wasm && cp -r $TMP/barretenberg-preset-wasm/build-wasm/* build-wasm/
mkdir -p build-wasm-threads && cp -r $TMP/barretenberg-preset-wasm-threads/build-wasm-threads/* build-wasm-threads/