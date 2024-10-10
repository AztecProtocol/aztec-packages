#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"
source ../../build-system/scripts/setup_env '' '' mainframe_$USER > /dev/null

CACHE_SCRIPTS=../../build-system/s3-cache-scripts

echo -e "\033[1mRetrieving bb.js from remote cache...\033[0m"
HASH=$(AZTEC_CACHE_REBUILD_PATTERNS="../cpp/.rebuild_patterns .rebuild_patterns" $CACHE_SCRIPTS/compute-content-hash.sh)

$CACHE_SCRIPTS/cache-download.sh bb.js-esm-$HASH.tar.gz > /dev/null
$CACHE_SCRIPTS/cache-download.sh bb.js-cjs-$HASH.tar.gz > /dev/null
$CACHE_SCRIPTS/cache-download.sh bb.js-browser-$HASH.tar.gz > /dev/null

# Annoyingly we still need to install modules, so they can be found as part of module resolution when portalled.
yarn install
