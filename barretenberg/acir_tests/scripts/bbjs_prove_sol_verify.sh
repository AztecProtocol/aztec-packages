#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

export HARDWARE_CONCURRENCY=8

cd ../acir_tests/$1

output_dir=$(mktemp -d ./output-XXXXXX)
trap "rm -rf $output_dir" EXIT

# Generate the proof and VK
node ../../bbjs-test prove \
  -b target/program.json \
  -w target/witness.gz \
  -o $output_dir \
  --oracle-hash $oracle_hash

bb=$(../../../cpp/scripts/find-bb)

# Default to keccakZK for solidity compatibility
oracle_hash="keccakZK"
has_zk="true"

# Process additional arguments
shift
for arg in "$@"; do
    if [[ "$arg" == "--disable_zk" ]]; then
        has_zk="false"
        oracle_hash="keccak"
    fi
done

# Use the BB CLI to write the solidity verifier - this can also be done with bb.js
$bb write_solidity_verifier --scheme ultra_honk -k $output_dir/vk -o $output_dir/Verifier.sol

# Verify the proof using the solidity verifier
PROOF="$output_dir/proof" \
PUBLIC_INPUTS="$output_dir/public_inputs" \
VERIFIER_PATH="$output_dir/Verifier.sol" \
TEST_PATH="../../sol-test/HonkTest.sol" \
HAS_ZK="$has_zk" \
TEST_NAME=$(basename $(realpath .)) \
  node ../../sol-test/src/index.js
