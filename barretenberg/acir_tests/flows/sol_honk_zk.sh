#!/bin/sh
set -eux

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH $VFLAG --scheme ultra_honk --zk"
[ "${RECURSIVE}" = "true" ] && FLAGS+=" --recursive"
PROTOCOL_FLAGS=" --honk_recursion 1 --oracle_hash keccak"

outdir=$(mktemp -d)
trap "rm -rf $outdir" EXIT

# Export the paths to the environment variables for the js test runner
export PROOF="$outdir/proof"
export PROOF_AS_FIELDS="$outdir/proof_fields.json"
export VK="$outdir/vk"
export VERIFIER_CONTRACT="$outdir/Verifier.sol"

# Create a proof, write the solidity contract, write the proof as fields in order to extract the public inputs
$BIN prove -o $outdir $FLAGS $BFLAG $PROTOCOL_FLAGS --output_data bytes_and_fields --output_content proof_and_vk
$BIN verify -k $VK -p $PROOF $FLAGS $PROTOCOL_FLAGS
$BIN write_contract $FLAGS -k $VK -o $VERIFIER_CONTRACT --zk

# Export the paths to the environment variables for the js test runner
export VERIFIER_PATH="$outdir/Verifier.sol"
export TEST_PATH=$(realpath "../../sol-test/HonkTest.sol")
export TESTING_HONK="true"
export HAS_ZK="true"


# Use solcjs to compile the generated key contract with the template verifier and test contract
# index.js will start an anvil, on a random port
# Deploy the verifier then send a test transaction
export TEST_NAME=$(basename $outdir)
node ../../sol-test/src/index.js
