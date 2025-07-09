#!/bin/bash

# prove using bb.js and verify using solidity verifier
set -eu

if [ "${SYS:-}" != "ultra_honk" ]; then
  echo "Error: This flow only supports ultra_honk"
  exit 1
fi

artifact_dir=$(realpath ./target)
output_dir=$artifact_dir/bbjs-sol-tmp
mkdir -p $output_dir

# Cleanup on exit
trap "rm -rf $output_dir" EXIT

# Generate the proof and VK
node ../../bbjs-test prove \
  -b $artifact_dir/program.json \
  -w $artifact_dir/witness.gz \
  -o $output_dir \
  --oracle-hash keccak

# Write the solidity verifier to ./target
export VK=$output_dir/vk
export VERIFIER_PATH="$output_dir/Verifier.sol"

# Use the BB CLI to write the solidity verifier - this can also be done with bb.js
$BIN write_solidity_verifier --scheme ultra_honk -k $VK -o $VERIFIER_PATH

# Verify the proof using the solidity verifier
export PROOF=$output_dir/proof
export PROOF_AS_FIELDS=$output_dir/proof_fields.json
export PUBLIC_INPUTS_AS_FIELDS=$output_dir/public_inputs_fields.json
export TEST_PATH=$(realpath "../../sol-test/HonkTest.sol")
export TESTING_HONK="true"
export TEST_NAME=$(basename $(realpath ./))

node ../../sol-test/src/index.js
