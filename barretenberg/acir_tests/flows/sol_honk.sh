#!/bin/sh
set -eux

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH $VFLAG"

outdir=$(mktemp -d)
trap "rm -rf $outdir" EXIT


export PROOF="$outdir/sol_honk_proof"
export PROOF_AS_FIELDS="$outdir/sol_honk_proof_fields.json"
export VK="$outdir/sol_honk_vk"
export CONTRACT="$outdir/Verifier.sol"

# Create a proof, write the solidity contract, write the proof as fields in order to extract the public inputs
$BIN prove_ultra_keccak_honk -o $PROOF $FLAGS $BFLAG
$BIN write_vk_ultra_keccak_honk -o $VK $FLAGS $BFLAG
$BIN verify_ultra_keccak_honk -k $VK -p $PROOF $FLAGS
$BIN proof_as_fields_honk $FLAGS -p $PROOF -o $PROOF_AS_FIELDS
$BIN contract --scheme ultra_honk -k $VK $FLAGS -o $CONTRACT

# Export the paths to the environment variables for the js test runner
export VERIFIER_PATH="$outdir/Verifier.sol"
export TEST_PATH=$(realpath "../../sol-test/HonkTest.sol")
export TESTING_HONK="true"

# Use solcjs to compile the generated key contract with the template verifier and test contract
# index.js will start an anvil, on a random port
# Deploy the verifier then send a test transaction
export TEST_NAME=$(basename $outdir)
node ../../sol-test/src/index.js