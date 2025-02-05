#!/bin/sh
set -eux

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH $VFLAG"

export PROOF="$PWD/sol_honk_zk_proof"
export PROOF_AS_FIELDS="$PWD/sol_honk_zk_proof_fields.json"
export VK="$PWD/sol_honk_zk_vk"

# Create a proof, write the solidity contract, write the proof as fields in order to extract the public inputs
$BIN prove_ultra_keccak_honk_zk -o $PROOF $FLAGS $BFLAG
$BIN write_vk_ultra_keccak_honk -o $VK $FLAGS $BFLAG
$BIN verify_ultra_keccak_honk_zk -k $VK -p $PROOF $FLAGS
$BIN proof_as_fields_honk $FLAGS -p $PROOF -o $PROOF_AS_FIELDS
$BIN contract_ultra_honk_zk -k $VK $FLAGS -o ZKVerifier.sol

# Export the paths to the environment variables for the js test runner
export VERIFIER_PATH="$PWD/ZKVerifier.sol"
export TEST_PATH=$(realpath "../../sol-test/ZKHonkTest.sol")
export TESTING_HONK="true"
export HAS_ZK="true"


# Use solcjs to compile the generated key contract with the template verifier and test contract
# index.js will start an anvil, on a random port
# Deploy the verifier then send a test transaction
export TEST_NAME=$(basename $PWD)
node ../../sol-test/src/index.js
