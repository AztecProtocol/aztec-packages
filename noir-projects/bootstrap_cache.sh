#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

SCRIPTS_PATH=../build-system/s3-cache-scripts/

echo -e "\033[1mRetrieving noir projects from remote cache...\033[0m"

PROTOCOL_CIRCUITS_HASH=$(AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native ../barretenberg/cpp/.rebuild_patterns ./noir-protocol-circuits/.rebuild_patterns" $SCRIPTS_PATH/compute-content-hash.sh)
MOCK_CIRCUITS_HASH=$(AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native ../barretenberg/cpp/.rebuild_patterns ./mock-protocol-circuits/.rebuild_patterns" $SCRIPTS_PATH/compute-content-hash.sh)
CONTRACTS_HASH=$(AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native ../avm-transpiler/.rebuild_patterns ../barretenberg/cpp/.rebuild_patterns noir-contracts/.rebuild_patterns" $SCRIPTS_PATH/compute-content-hash.sh)

echo "
noir-protocol-circuits $PROTOCOL_CIRCUITS_HASH
mock-protocol-circuits $MOCK_CIRCUITS_HASH
noir-contracts $CONTRACTS_HASH
" | xargs --max-procs 0 --max-args 2 bash -c "$SCRIPTS_PATH/cache-download.sh noir-projects-\$0-\$1.tar.gz \$0"

yarn
