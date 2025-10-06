#!/usr/bin/env bash
# This script performs postprocessing on compiled Noir contracts.
# It expects to find compiled artifacts and transforms them via
# transpilation and verification key generation.
#
# Usage: transpile_contract_and_gen_vks.sh [artifact_path ...]
# If no paths provided, bb will search for artifacts in target/ directories
set -euo pipefail

dir=$(dirname $0)
BB=${BB:-"$dir/../barretenberg/cpp/build/bin/bb"}

# No arguments provided - let bb auto-discover and process all artifacts
echo "Searching for contract artifacts in target/ directories..."
$BB aztec_process

echo "Contract postprocessing complete!"
