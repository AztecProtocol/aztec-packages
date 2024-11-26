#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"
ci3="$(git rev-parse --show-toplevel)/ci3"

echo -e "\033[1mRetrieving contracts from remote cache...\033[0m"
export AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns
HASH=$($ci3/cache/content_hash)
$ci3/cache/download l1-contracts-$HASH.tar.gz
