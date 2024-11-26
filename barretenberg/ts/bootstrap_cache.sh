#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
ci3="$(git rev-parse --show-toplevel)/ci3"

$ci3/github/group "bb.js cache lookup"

echo -e "\033[1mRetrieving bb.js from remote cache...\033[0m"
export AZTEC_CACHE_REBUILD_PATTERNS="../cpp/.rebuild_patterns .rebuild_patterns"
$ci3/cache/download bb.js-$($ci3/cache/content_hash).tar.gz

# We still need to install modules, so they can be found as part of module resolution when portalled.
GITHUB_ACTIONS="" yarn install
# The md5sum of everything is the same after each yarn call, yet seemingly yarn's content hash will churn unless we reset timestamps
find node_modules -exec touch -t 197001010000 {} +

$ci3/github/endgroup
