#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"
ci3="$(git rev-parse --show-toplevel)/ci3"

echo -e "\033[1mRetrieving noir packages from remote cache...\033[0m"
export AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns_native
$ci3/cache/download noir-nargo-$($ci3/cache/content_hash).tar.gz

echo -e "\033[1mRetrieving nargo from remote cache...\033[0m"
export AZTEC_CACHE_REBUILD_PATTERNS="../barretenberg/cpp/.rebuild_patterns ../barretenberg/ts/.rebuild_patterns .rebuild_patterns_packages"
$ci3/cache/download noir-packages-$($ci3/cache/content_hash).tar.gz
