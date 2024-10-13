#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

echo -e "\033[1mRetrieving noir packages from remote cache...\033[0m"
NATIVE_HASH=$(AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns_native ../build-system/s3-cache-scripts/compute-content-hash.sh)
../build-system/s3-cache-scripts/cache-download.sh noir-nargo-$NATIVE_HASH.tar.gz

echo -e "\033[1mRetrieving nargo from remote cache...\033[0m"
PACKAGES_HASH=$(AZTEC_CACHE_REBUILD_PATTERNS="../barretenberg/cpp/.rebuild_patterns ../barretenberg/ts/.rebuild_patterns .rebuild_patterns_packages" ../build-system/s3-cache-scripts/compute-content-hash.sh)
../build-system/s3-cache-scripts/cache-download.sh noir-packages-$PACKAGES_HASH.tar.gz
