#!/bin/sh
set -eux

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH $VFLAG --scheme ultra_honk"
PROTOCOL_FLAGS=" --honk_recursion 1 --oracle_hash keccak"

outdir=$(mktemp -d)
trap "rm -rf $outdir" EXIT

# Create a proof, write the solidity contract
$BIN prove -o $outdir $FLAGS $BFLAG $PROTOCOL_FLAGS --write_vk
$BIN verify -i $outdir/public_inputs -k $outdir/vk -p $outdir/proof $FLAGS $PROTOCOL_FLAGS
$BIN write_solidity_verifier $FLAGS -k $outdir/vk -o $outdir/Verifier.sol

# Export the paths to the environment variables for the js test runner
export PUBLIC_INPUTS="$outdir/public_inputs"
export PROOF="$outdir/proof"
export VK="$outdir/vk"
export VERIFIER_CONTRACT="$outdir/Verifier.sol"

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
