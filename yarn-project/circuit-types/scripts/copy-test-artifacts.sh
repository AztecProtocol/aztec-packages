#!/usr/bin/env bash
set -euo pipefail

# Check for .json files existence
if ! ls ../../noir-projects/noir-contracts/target/*.json >/dev/null 2>&1; then
  echo "Error: No .json files found in noir-contracts/target folder."
  echo "Make sure noir-contracts is built before running this script."
  exit 1
fi

# Ensure outdir exists
mkdir -p ./src/test/artifacts

# Copy the token contract for testing
cp ../../noir-projects/noir-contracts/target/token_contract-Token.json ./src/test/artifacts/
echo "Copied token_contract-Token.json to ./src/test/artifacts/"