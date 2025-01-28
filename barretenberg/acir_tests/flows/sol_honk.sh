#!/bin/sh
set -eux

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
BASE_FLAGS="-c $CRS_PATH $VFLAG"
FLAGS=$BASE_FLAGS" --scheme ultra_honk --oracle_hash keccak"
[ "${RECURSIVE}" = "true" ] && FLAGS+=" --recursive"

outdir=$(mktemp -d)
trap "rm -rf $outdir" EXIT

# Export the paths to the environment variables for the js test runner
export PROOF="$outdir/proof"
export PROOF_AS_FIELDS="$outdir/proof_fields.json"
export VK="$outdir/vk"
export VERIFIER_CONTRACT="$outdir/Verifier.sol"

# Create a proof, write the solidity contract, write the proof as fields in order to extract the public inputs
$BIN prove -o $outdir $FLAGS $BFLAG
# $BIN write_vk -o $VK $FLAGS $BFLAG
$BIN verify -k $VK -p $PROOF $FLAGS # useful for debugging
$BIN proof_as_fields_honk $BASE_FLAGS -p $PROOF -o $PROOF_AS_FIELDS
$BIN contract $FLAGS -k $VK -o $VERIFIER_CONTRACT

# Export the paths to the environment variables for the js test runner
export VERIFIER_PATH="$outdir/Verifier.sol"
export TEST_PATH=$(realpath "../../sol-test/HonkTest.sol")
export TESTING_HONK="true"

# Use solcjs to compile the generated key contract with the template verifier and test contract
# index.js will start an anvil, on a random port
# Deploy the verifier then send a test transaction
export TEST_NAME=$(basename $outdir)
node ../../sol-test/src/index.js