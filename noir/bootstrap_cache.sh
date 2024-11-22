#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

export PATH=$PWD/../build-system/s3-cache-scripts:$PATH

echo -e "\033[1mRetrieving noir packages from remote cache...\033[0m"
export AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns_native
cache-download.sh noir-nargo-$(compute-content-hash.sh).tar.gz

echo -e "\033[1mRetrieving nargo from remote cache...\033[0m"
export AZTEC_CACHE_REBUILD_PATTERNS="../barretenberg/cpp/.rebuild_patterns ../barretenberg/ts/.rebuild_patterns .rebuild_patterns_packages"
cache-download.sh noir-packages-$(compute-content-hash.sh).tar.gz
