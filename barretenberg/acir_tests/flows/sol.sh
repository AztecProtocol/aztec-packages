#!/bin/sh
set -eu
DIR="$(dirname $0)"
VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH $VFLAG"

export PROOF="$PWD/sol_proof"
export PROOF_AS_FIELDS="$PWD/sol_proof_fields.json"
export VK="$PWD/sol_vk"

# Create a proof, write the solidity contract, write the proof as fields in order to extract the public inputs
$BIN prove -o $PROOF $FLAGS
$BIN write_vk  -o $VK $FLAGS
$BIN proof_as_fields -k $VK $FLAGS -p $PROOF
$BIN contract -k $VK $FLAGS $BFLAG -o Key.sol

# Export the paths to the environment variables for the js test runner
<<<<<<< HEAD
export KEY_PATH="$(pwd)/Key.sol"
export VERIFIER_PATH="$DIR/../sol-test/Verifier.sol"
export TEST_PATH="$DIR/../sol-test/Test.sol"
export BASE_PATH="$DIR/../../sol/src/ultra/BaseUltraVerifier.sol"
=======
export KEY_PATH="$PWD/Key.sol"
export VERIFIER_PATH=$(realpath "../../sol-test/Verifier.sol")
export TEST_PATH=$(realpath "../../sol-test/Test.sol")
export BASE_PATH=$(realpath "../../../sol/src/ultra/BaseUltraVerifier.sol")
>>>>>>> origin/cl/ci3

# Use solcjs to compile the generated key contract with the template verifier and test contract
# index.js will start an anvil, on a random port
# Deploy the verifier then send a test transaction
export TEST_NAME=$(basename $(pwd))
yarn --cwd "$DIR/../sol-test/" start
