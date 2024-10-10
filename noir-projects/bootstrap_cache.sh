#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

SCRIPTS_PATH=../build-system/s3-cache-scripts/

echo -e "\033[1mRetrieving noir projects from remote cache...\033[0m"

PROTOCOL_CIRCUITS_HASH=$(AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native ../barretenberg/cpp/.rebuild_patterns ./noir-protocol-circuits/.rebuild_patterns" $SCRIPTS_PATH/compute-content-hash.sh)
$SCRIPTS_PATH/cache-download.sh noir-projects-noir-protocol-circuits-2-$PROTOCOL_CIRCUITS_HASH.tar.gz noir-protocol-circuits

MOCK_CIRCUITS_HASH=$(AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native ../barretenberg/cpp/.rebuild_patterns ./mock-protocol-circuits/.rebuild_patterns" $SCRIPTS_PATH/compute-content-hash.sh)
$SCRIPTS_PATH/cache-download.sh noir-projects-mock-protocol-circuits-$MOCK_CIRCUITS_HASH.tar.gz mock-protocol-circuits

CONTRACTS_HASH=$(AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native ../avm-transpiler/.rebuild_patterns ../barretenberg/cpp/.rebuild_patterns noir-contracts/.rebuild_patterns" $SCRIPTS_PATH/compute-content-hash.sh)
$SCRIPTS_PATH/cache-download.sh noir-projects-noir-contracts-$CONTRACTS_HASH.tar.gz noir-contracts

yarn

(cd ./noir-protocol-circuits && yarn && node ./scripts/generate_variants.js)
