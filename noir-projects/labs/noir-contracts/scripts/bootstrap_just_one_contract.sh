#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

# Call example:
# `./scripts/bootstrap_just_one_contract.sh nft_contract NFT`

# Check if the filename argument is provided
if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <contract-package-name> <contract-name>"
  echo "The filename should be as per those spat out into the 'target/' dir, without json. E.g. 'nft_contract NFT'"
  exit 1
fi

CONTRACT_PACKAGE_NAME=$1
CONTRACT_NAME=$2
JSON_NAME="$CONTRACT_PACKAGE_NAME-$CONTRACT_NAME"

# Ensure the target JSON file exists
if [ ! -f "../target/$JSON_NAME.json" ]; then
  echo "Error: File '../target/$JSON_NAME.json' not found."
  exit 1
fi

# Compile the contract
echo "Compiling contract..."
NARGO=${NARGO:-../../../noir/noir-repo/target/release/nargo}
$NARGO compile --silence-warnings --inliner-aggressiveness 0 --package $CONTRACT_PACKAGE_NAME

# Transpile public functions, strip internal prefixes, and generate VKs for private functions.
echo "Processing contract artifact..."
BB=${BB:-../../../barretenberg/cpp/build/bin/bb}
"$BB" aztec_process -i "../target/$JSON_NAME.json" -o "../target/$JSON_NAME.json" -f

echo "Done."

