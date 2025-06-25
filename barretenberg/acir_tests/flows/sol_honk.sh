#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH $VFLAG --scheme ultra_honk --disable_zk"
PROVE_FLAGS="$FLAGS $BFLAG --oracle_hash keccak --output_format bytes_and_fields --write_vk"
VERIFY_FLAGS="$FLAGS --oracle_hash keccak"

outdir=$(mktemp -d)
trap "rm -rf $outdir" EXIT

# Export the paths to the environment variables for the js test runner
export PUBLIC_INPUTS="$outdir/public_inputs"
export PUBLIC_INPUTS_AS_FIELDS="$outdir/public_inputs_fields.json"
export PROOF="$outdir/proof"
export PROOF_AS_FIELDS="$outdir/proof_fields.json"
export VK="$outdir/vk"
export VERIFIER_CONTRACT="$outdir/Verifier.sol"

# Create a proof, write the solidity contract, write the proof as fields in order to extract the public inputs
$BIN prove $PROVE_FLAGS -o $outdir
$BIN verify $VERIFY_FLAGS -i $PUBLIC_INPUTS -k $VK -p $PROOF
$BIN write_solidity_verifier $FLAGS -k $VK -o $VERIFIER_CONTRACT

# Export the paths to the environment variables for the js test runner
export VERIFIER_PATH="$outdir/Verifier.sol"
export TEST_PATH=$(realpath "../../sol-test/HonkTest.sol")
export TESTING_HONK="true"

# Use solcjs to compile the generated key contract with the template verifier and test contract
# index.js will start an anvil, on a random port
# Deploy the verifier then send a test transaction
export TEST_NAME=$(basename $outdir)
node ../../sol-test/src/index.js
