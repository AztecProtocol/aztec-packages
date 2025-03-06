#!/usr/bin/env bash
set -eo pipefail

# Create destination directory if it doesn't exist
mkdir -p ../aztec.js/src/fee/contracts/artifacts
mkdir -p ../aztec.js/src/fee/contracts/typescript_artifacts

# Format the JSON contract artifacts
run -T prettier --write ./artifacts/token_contract-Token.json
run -T prettier --write ./artifacts/fpc_contract-FPC.json

# Format the TypeScript artifacts
run -T prettier --write ./src/Token.ts
run -T prettier --write ./src/FPC.ts

# Copy contract artifacts
cp ./artifacts/token_contract-Token.json ../aztec.js/src/fee/contracts/artifacts/
cp ./artifacts/fpc_contract-FPC.json ../aztec.js/src/fee/contracts/artifacts/

# Copy TypeScript artifacts
cp ./src/Token.ts ../aztec.js/src/fee/contracts/typescript_artifacts/
cp ./src/FPC.ts ../aztec.js/src/fee/contracts/typescript_artifacts/
