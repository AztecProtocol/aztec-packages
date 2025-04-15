#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

# Call example:
# `./scripts/bootstrap_just_one_contract.sh nft_contract NFT`

# Check if the filename argument is provided
if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <contract-package-name> <contract-name> [command]"
  echo "The filename should be as per those spat out into the 'target/' dir, without json. E.g. 'nft_contract NFT'"
  exit 1
fi

CONTRACT_PACKAGE_NAME=$1
CONTRACT_NAME=$2
JSON_NAME="$CONTRACT_PACKAGE_NAME-$CONTRACT_NAME"

CMD=${3:-}  # Check for a 3rd arg that shouldn't be there.

# Handle the "clean" command
if [ -n "$CMD" ]; then
  echo "Unknown command: $CMD"
  exit 1
fi

# Ensure the target JSON file exists
if [ ! -f "../target/$JSON_NAME.json" ]; then
  echo "Error: File '../target/$JSON_NAME.json' not found."
  exit 1
fi

# Compile the contract
echo "Compiling contract..."
NARGO=${NARGO:-../../../noir/noir-repo/target/release/nargo}
$NARGO compile --silence-warnings --inliner-aggressiveness 0 --package $CONTRACT_PACKAGE_NAME

# Transpile the contract
echo "Transpiling contract..."
TRANSPILER=${TRANSPILER:-../../../avm-transpiler/target/release/avm-transpiler}
"$TRANSPILER" "../target/$JSON_NAME.json" "../target/$JSON_NAME.json"

# Postprocess the contract
echo "Postprocessing contract..."
BB_HASH=${BB_HASH:-$(cd ../../../ && git ls-tree -r HEAD | grep 'barretenberg/cpp' | awk '{print $3}' | git hash-object --stdin)}
echo "Using BB hash $BB_HASH"

tempDir="../target/tmp"
mkdir -p "$tempDir"

BB_HASH=$BB_HASH node ./postprocess_contract.js "../target/$JSON_NAME.json" "$tempDir"

