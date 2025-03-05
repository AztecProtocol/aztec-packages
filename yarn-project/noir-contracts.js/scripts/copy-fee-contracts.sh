#!/usr/bin/env bash
set -eo pipefail

# Create destination directory if it doesn't exist
mkdir -p ../../aztec.js/src/fee/contracts/artifacts
mkdir -p ../../aztec.js/src/fee/contracts/typescript_artifacts

# Copy TypeScript contract files
cp ../src/Token.ts ../../aztec.js/src/fee/contracts/typescript_artifacts/
cp ../src/FPC.ts ../../aztec.js/src/fee/contracts/typescript_artifacts/

# Copy contract artifacts
cp ../artifacts/token_contract-Token.json ../../aztec.js/src/fee/contracts/artifacts/
cp ../artifacts/fpc_contract-FPC.json ../../aztec.js/src/fee/contracts/artifacts/
