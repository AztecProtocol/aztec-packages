#!/bin/sh
set -eu

export PROOF="$(pwd)/proof"
export PROOF_AS_FIELDS="$(pwd)/proof_fields.json"

# Get the number of public inputs in the circuit
gates=$($BIN gates -v 2>&1 | tr -d '\0') 
export NUM_PUBLIC_INPUTS=$(echo "$gates" | grep -o 'public inputs: [0-9]*' | awk '{print $3}')

# Create a proof, write the solidity contract, write the proof as fields in order to extract the public inputs
$BIN prove -o proof
$BIN write_vk  -o vk
$BIN proof_as_fields -k vk -c $CRS_PATH -p $PROOF
$BIN contract -k vk -c $CRS_PATH -b ./target/acir.gz -o Key.sol

# Export the paths to the environment variables for the js test runner
export KEY_PATH="$(pwd)/Key.sol"
export VERIFIER_PATH=$(realpath "../../sol-test/Verifier.sol")
export TEST_PATH=$(realpath "../../sol-test/Test.sol")
export BASE_PATH=$(realpath "../../../sol/src/ultra/BaseUltraVerifier.sol")

# Use solcjs to compile the generated key contract with the template verifier and test contract 
# index.js will start an anvil, on a random port
# Deploy the verifier then send a test transaction
export TEST_NAME=$(basename $(pwd))
node ../../sol-test/src/index.js