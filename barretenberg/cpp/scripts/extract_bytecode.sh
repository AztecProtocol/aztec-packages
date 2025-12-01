#!/usr/bin/env bash
# Extract bytecode from a compiled contract JSON for debugging bb
# Usage: ./extract_bytecode.sh <contract_json> <function_name> <output_file>
# Example: ./extract_bytecode.sh ./target/schnorr_hardcoded_account_contract-SchnorrHardcodedAccount.json entrypoint /tmp/bytecode.bin

set -euo pipefail

if [ $# -lt 3 ]; then
    echo "Usage: $0 <contract_json> <function_name> <output_file>"
    echo "Example: $0 ./target/schnorr_hardcoded_account_contract-SchnorrHardcodedAccount.json entrypoint /tmp/bytecode.bin"
    exit 1
fi

CONTRACT_JSON=$1
FUNCTION_NAME=$2
OUTPUT_FILE=$3

# Extract bytecode for the specified function (keep gzipped - bb handles decompression)
jq -r --arg name "$FUNCTION_NAME" '.functions[] | select(.name == $name) | .bytecode' "$CONTRACT_JSON" | base64 -d > "$OUTPUT_FILE"

echo "Bytecode extracted to $OUTPUT_FILE"
