#!/bin/sh
set -eux

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH $VFLAG"

export PROOF="$PWD/sol_honk_proof"
export PROOF_AS_FIELDS="$PWD/sol_honk_proof_fields.json"
export VK="$PWD/sol_honk_vk"

# Create a proof, write the solidity contract, write the proof as fields in order to extract the public inputs
$BIN prove_ultra_keccak_honk -o $PROOF $FLAGS $BFLAG
$BIN write_vk_ultra_keccak_honk -o $VK $FLAGS $BFLAG
$BIN verify_ultra_keccak_honk -k vk -p $PROOF $FLAGS
$BIN proof_as_fields_honk $FLAGS -p $PROOF -o proof_fields.json
$BIN contract_ultra_honk -k $VK $FLAGS -o Verifier.sol

# Export the paths to the environment variables for the js test runner
export VERIFIER_PATH="$PWD/Verifier.sol"
export TEST_PATH=$(realpath "../../sol-test/HonkTest.sol")
export TESTING_HONK="true"

# Use solcjs to compile the generated key contract with the template verifier and test contract
# index.js will start an anvil, on a random port
# Deploy the verifier then send a test transaction
export TEST_NAME=$(basename $PWD)
node ../../sol-test/src/index.js
