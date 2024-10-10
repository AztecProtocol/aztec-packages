#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"
source ../../build-system/scripts/setup_env '' '' mainframe_$USER > /dev/null

CACHE_SCRIPTS=../../build-system/s3-cache-scripts

echo -e "\033[1mRetrieving bb.js from remote cache...\033[0m"
TMP=$(mktemp -d)

function on_exit() {
  rm -rf "$TMP"
}
trap on_exit EXIT

HASH=$(AZTEC_CACHE_REBUILD_PATTERNS="../cpp/.rebuild_patterns .rebuild_patterns" $CACHE_SCRIPTS/compute-content-hash.sh)

$CACHE_SCRIPTS/cache-download.sh bb.js-esm-$HASH.tar.gz $TMP/esm
$CACHE_SCRIPTS/cache-download.sh bb.js-cjs-$HASH.tar.gz $TMP/cjs
$CACHE_SCRIPTS/cache-download.sh bb.js-browser-$HASH.tar.gz $TMP/browser

cp -r $TMP/esm/dest dest
cp -r $TMP/cjs/dest dest
cp -r $TMP/browser/dest dest

# Annoyingly we still need to install modules, so they can be found as part of module resolution when portalled.
yarn install
