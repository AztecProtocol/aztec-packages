#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"
source ../build-system/scripts/setup_env '' '' mainframe_$USER > /dev/null

echo -e "\033[1mRetrieving noir packages from remote cache...\033[0m"
NATIVE_HASH=$(AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns_native compute-content-hash.sh)
cache-download.sh noir-nargo-$NATIVE_HASH.tar.gz > /dev/null

echo -e "\033[1mRetrieving nargo from remote cache...\033[0m"
PACKAGES_HASH=$(AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns_packages compute-content-hash.sh)
cache-download.sh noir-packages-$PACKAGES_HASH.tar.gz
