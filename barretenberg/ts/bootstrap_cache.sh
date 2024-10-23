#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

CACHE_SCRIPTS=../../build-system/s3-cache-scripts

echo -e "\033[1mRetrieving bb.js from remote cache...\033[0m"
TMP=$(mktemp -d)

function on_exit() {
  rm -rf "$TMP"
}
trap on_exit EXIT

HASH=$(AZTEC_CACHE_REBUILD_PATTERNS="../cpp/.rebuild_patterns .rebuild_patterns" $CACHE_SCRIPTS/compute-content-hash.sh)

# Parallel download of all the cached builds because they're quite big
echo "
bb.js-esm
bb.js-cjs
bb.js-browser
" | xargs --max-procs 0 -I {} bash -c "$CACHE_SCRIPTS/cache-download.sh {}-$HASH.tar.gz $TMP/{}"

mkdir -p dest
cp -r $TMP/bb.js-esm/dest/* dest/
cp -r $TMP/bb.js-cjs/dest/* dest/
cp -r $TMP/bb.js-browser/dest/* dest/

# Annoyingly we still need to install modules, so they can be found as part of module resolution when portalled.
yarn install
