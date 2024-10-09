#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"
source ../build-system/scripts/setup_env '' '' mainframe_$USER > /dev/null

echo -e "\033[1mRetrieving contracts from remote cache...\033[0m"
HASH=$(AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns compute-content-hash.sh)
cache-download.sh l1-contracts-$HASH.tar.gz > /dev/null
