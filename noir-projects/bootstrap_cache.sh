#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"
source ../build-system/scripts/setup_env '' '' mainframe_$USER > /dev/null

echo -e "\033[1mRetrieving noir projects from remote cache...\033[0m"

PROTOCOL_CIRCUITS_HASH=$(AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native ../barretenberg/cpp/.rebuild_patterns ./noir-protocol-circuits/.rebuild_patterns" compute-content-hash.sh)
cache-download.sh noir-projects-noir-protocol-circuits-$PROTOCOL_CIRCUITS_HASH.tar.gz noir-protocol-circuits > /dev/null

MOCK_CIRCUITS_HASH=$(AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native ../barretenberg/cpp/.rebuild_patterns ./mock-protocol-circuits/.rebuild_patterns" compute-content-hash.sh)
cache-download.sh noir-projects-mock-protocol-circuits-$MOCK_CIRCUITS_HASH.tar.gz mock-protocol-circuits > /dev/null

CONTRACTS_HASH=$(AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native ../avm-transpiler/.rebuild_patterns ../barretenberg/cpp/.rebuild_patterns noir-contracts/.rebuild_patterns" compute-content-hash.sh)
cache-download.sh noir-projects-noir-contracts-$CONTRACTS_HASH.tar.gz noir-contracts > /dev/null

yarn

(cd ./noir-protocol-circuits && yarn && node ./scripts/generate_variants.js)
