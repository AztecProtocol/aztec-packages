#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

echo -e "\033[1mRetrieving noir projects from remote cache...\033[0m"

export AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native ../barretenberg/cpp/.rebuild_patterns ./noir-protocol-circuits/.rebuild_patterns"
PROTOCOL_CIRCUITS_HASH=$($ci3/cache/content_hash)

export AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native ../barretenberg/cpp/.rebuild_patterns ./mock-protocol-circuits/.rebuild_patterns"
MOCK_CIRCUITS_HASH=$($ci3/cache/content_hash)

export AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native ../avm-transpiler/.rebuild_patterns ../barretenberg/cpp/.rebuild_patterns noir-contracts/.rebuild_patterns"
CONTRACTS_HASH=$($ci3/cache/content_hash)

echo "
noir-protocol-circuits $PROTOCOL_CIRCUITS_HASH
mock-protocol-circuits $MOCK_CIRCUITS_HASH
noir-contracts $CONTRACTS_HASH
" | xargs --max-procs 0 --max-args 2 bash -c "$ci3/cache/download noir-projects-\$0-\$1.tar.gz \$0"

GITHUB_ACTIONS="" yarn
