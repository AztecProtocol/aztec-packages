#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH $VFLAG"

# Create a proof, write the solidity contract
$BIN OLD_API prove -o sol_proof $FLAGS
$BIN OLD_API write_vk  -o sol_vk $FLAGS
$BIN OLD_API contract -k sol_vk $FLAGS $BFLAG -o Key.sol

# Export paths for JS test runner
export PROOF="$PWD/sol_proof"
export VK="$PWD/sol_vk"

# Export the paths to the environment variables for the js test runner
export KEY_PATH="$PWD/Key.sol"
export VERIFIER_PATH=$(realpath "../../sol-test/Verifier.sol")
export TEST_PATH=$(realpath "../../sol-test/Test.sol")
export BASE_PATH=$(realpath "../../../sol/src/ultra/BaseUltraVerifier.sol")

# Use solcjs to compile the generated key contract with the template verifier and test contract
# index.js will start an anvil, on a random port
# Deploy the verifier then send a test transaction
export TEST_NAME=$(basename $(pwd))
node ../../sol-test/src/index.js
