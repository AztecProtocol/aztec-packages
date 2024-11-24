#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

PATH=$PWD/../../build-system/s3-cache-scripts:$PATH

echo -e "\033[1mRetrieving bb.js from remote cache...\033[0m"
export AZTEC_CACHE_REBUILD_PATTERNS="../cpp/.rebuild_patterns .rebuild_patterns"
cache-download.sh bb.js-$(compute-content-hash.sh).tar.gz

# We still need to install modules, so they can be found as part of module resolution when portalled.
yarn install

# Need to remove this file, otherwise downstream portals seem to get some checksum mismatch...
rm .yarn/install-state.gz