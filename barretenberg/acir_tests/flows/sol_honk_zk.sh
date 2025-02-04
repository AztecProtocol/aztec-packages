#!/bin/sh
set -eux

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
BASE_FLAGS="-c $CRS_PATH $VFLAG"
FLAGS=$BASE_FLAGS" --scheme ultra_honk --oracle_hash keccak --zk --output_type bytes_and_fields --output_content proof_and_vk -h 1"
[ "${RECURSIVE}" = "true" ] && FLAGS+=" --recursive"

# outdir=$(mktemp -d)
# trap "rm -rf $PWD" EXIT

# Export the paths to the environment variables for the js test runner
export PROOF="$PWD/proof"
export PROOF_AS_FIELDS="$PWD/proof_fields.json"
export VK="$PWD/vk"
export VERIFIER_CONTRACT="$PWD/ZKVerifier.sol"

# Create a proof, write the solidity contract, write the proof as fields in order to extract the public inputs
$BIN prove -o $PWD $FLAGS $BFLAG -o $PWD
$BIN verify -k $VK -p $PROOF $FLAGS # useful for debugging
$BIN contract $FLAGS -k $VK -o $VERIFIER_CONTRACT

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
