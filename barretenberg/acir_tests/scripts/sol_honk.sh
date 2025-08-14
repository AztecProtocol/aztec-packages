#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd ../acir_tests/$1

bb=$(../../../cpp/scripts/find-bb)

# Build base flags
flags="${VERBOSE:+-v} --scheme ultra_honk"

# Add any additional arguments passed from command line
shift
for arg in "$@"; do
    flags+=" $arg"
done

# Check if --disable_zk is in the flags to determine HAS_ZK
if [[ "$flags" == *"--disable_zk"* ]]; then
    has_zk="false"
else
    has_zk="true"
fi

mkdir -p output-$$
trap "rm -rf output-$$" EXIT

# Create a proof, write the solidity contract, write the proof as fields in order to extract the public inputs
$bb prove $flags -b target/program.json --oracle_hash keccak --output_format bytes_and_fields --write_vk -o output-$$
$bb verify $flags --oracle_hash keccak -i output-$$/public_inputs -k output-$$/vk -p output-$$/proof
$bb write_solidity_verifier $flags -k output-$$/vk -o output-$$/Verifier.sol

# Use solcjs to compile the generated key contract with the template verifier and test contract
# index.js will start an anvil, on a random port
# Deploy the verifier then send a test transaction
PROOF_AS_FIELDS="output-$$/proof_fields.json" \
PUBLIC_INPUTS_AS_FIELDS="output-$$/public_inputs_fields.json" \
VERIFIER_PATH="output-$$/Verifier.sol" \
TEST_PATH="../../sol-test/HonkTest.sol" \
HAS_ZK="$has_zk" \
TEST_NAME=$(basename output-$$) \
node ../../sol-test/src/index.js
