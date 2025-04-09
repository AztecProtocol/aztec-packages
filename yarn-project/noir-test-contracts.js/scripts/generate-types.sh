#!/usr/bin/env bash
set -eo pipefail

OUT_DIR="./src"
INDEX="$OUT_DIR/index.ts"

FORCE=""
if [ "$1" == "--force" ]; then
  FORCE="--force"
fi

mkdir -p $OUT_DIR

# Extract test contract names from Nargo.toml
TEST_CONTRACTS=$(grep "contracts/test/" ../../noir-projects/noir-contracts/Nargo.toml | sed 's/.*contracts\/test\/\([^"]*\)_contract.*/\1/')

# Check for .json files existence
if ! ls ../../noir-projects/noir-contracts/target/*.json >/dev/null 2>&1; then
  echo "Error: No .json files found in noir-contracts/target folder."
  echo "Make sure noir-contracts is built before running this script."
  exit 1
fi

# Generate index.ts header
echo "// Auto generated module - do not edit!" >"$INDEX"

# Ensure the artifacts directory exists
mkdir -p artifacts

decl=$(cat <<EOF
import { type NoirCompiledContract } from '@aztec/stdlib/noir';
const circuit: NoirCompiledContract;
export = circuit;
EOF
);

# Copy the artifacts to the artifacts folder
for contract in $TEST_CONTRACTS; do
  # Find the matching ABI file for this contract
  ABI=$(find "../../noir-projects/noir-contracts/target" -name "${contract}_contract-*.json" | head -n 1)
  if [ -n "$ABI" ]; then
    # Extract the filename from the path
    filename=$(basename "$ABI")
    dts_file=$(echo $filename | sed 's/.json/.d.json.ts/g');

    # Copy the JSON file to the artifacts folder
    cp "$ABI" "artifacts/$filename"
    echo "$decl" > "artifacts/$dts_file"
  fi
done

# Generate types for the contracts
node --no-warnings ../builder/dest/bin/cli.js codegen $FORCE -o $OUT_DIR artifacts

# Append exports for each generated TypeScript file to index.ts
echo "/** List of contract names exported by this package. */" >>"$INDEX"
echo "export const ContractNames = [" >>"$INDEX"
find "$OUT_DIR" -maxdepth 1 -type f -name '*.ts' ! -name 'index.ts' | while read -r TS_FILE; do
  CONTRACT_NAME=$(basename "$TS_FILE" .ts) # Remove the .ts extension to get the contract name
  echo "  '$CONTRACT_NAME'," >>"$INDEX"
done
echo "];" >>"$INDEX"
