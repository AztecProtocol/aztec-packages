#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd ../acir_tests/$1

export HARDWARE_CONCURRENCY=8

bb=$(../../../cpp/scripts/find-bb)

# Build base flags
flags="-v --scheme ultra_honk"

# Add any additional arguments passed from command line
shift
for arg in "$@"; do
    flags+=" $arg"
done

USE_OPTIMIZED_CONTRACT=${USE_OPTIMIZED_CONTRACT:-false}

write_contract_flags=$flags
if [[ "$USE_OPTIMIZED_CONTRACT" == "true" ]]; then
    write_contract_flags+=" --optimized"
fi

# Check if --disable_zk is in the flags to determine HAS_ZK
if [[ "$flags" == *"--disable_zk"* ]]; then
    has_zk="false"
else
    has_zk="true"
fi

mkdir -p output-$$
trap "rm -rf output-$$" EXIT

# Create a proof, write the solidity contract, write the proof as fields in order to extract the public inputs
$bb prove $flags -b target/program.json --oracle_hash keccak --write_vk -o output-$$
$bb verify $flags --oracle_hash keccak -i output-$$/public_inputs -k output-$$/vk -p output-$$/proof
$bb write_solidity_verifier $write_contract_flags -k output-$$/vk -o output-$$/Verifier.sol

# Use solcjs to compile the generated key contract with the template verifier and test contract
# index.js will start an anvil, on a random port
# Deploy the verifier then send a test transaction
PROOF="output-$$/proof" \
PUBLIC_INPUTS="output-$$/public_inputs" \
VERIFIER_PATH="output-$$/Verifier.sol" \
TEST_PATH="../../sol-test/HonkTest.sol" \
HAS_ZK="$has_zk" \
TEST_NAME=$(basename output-$$) \
  node ../../sol-test/src/index.js
