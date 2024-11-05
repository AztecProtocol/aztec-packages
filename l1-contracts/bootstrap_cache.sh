#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

echo -e "\033[1mRetrieving contracts from remote cache...\033[0m"
HASH=$(AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns ../build-system/s3-cache-scripts/compute-content-hash.sh)
../build-system/s3-cache-scripts/cache-download.sh l1-contracts-$HASH.tar.gz
