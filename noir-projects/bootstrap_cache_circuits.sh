#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

echo -e "\033[1mRetrieving noir projects circuits from remote cache...\033[0m"

export AZTEC_CACHE_REBUILD_PATTERNS={../noir,noir-protocol-circuits,mock-protocol-circuits,noir-contracts}/.rebuild_patterns
$ci3/cache/download noir-projects-circuits-$($ci3/cache/content_hash).tar.gz

