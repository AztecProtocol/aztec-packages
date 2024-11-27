#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

$ci3/github/group "bb.js cache lookup"

echo -e "\033[1mRetrieving bb.js from remote cache...\033[0m"
export AZTEC_CACHE_REBUILD_PATTERNS="../cpp/.rebuild_patterns .rebuild_patterns"
$ci3/cache/download bb.js-$($ci3/cache/content_hash).tar.gz

# We still need to install modules, so they can be found as part of module resolution when portalled.
yarn install
# Make sure timestamps are reset for yarn content hash
find . -exec touch -d "@0" {} + 2>/dev/null || true
$ci3/github/endgroup
