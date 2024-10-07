#!/bin/bash
set -eu

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# Starts the Prover Node
REPO=$(git rev-parse --show-toplevel)

echo "Waiting for l1 contracts to be deployed..."
until [ -f "$REPO"/yarn-project/end-to-end/scripts/native-network/l1-contracts.env ] ; do
  sleep 1
done

source "$REPO"/yarn-project/end-to-end/scripts/native-network/l1-contracts.env

# Get node info from the boot node
output=$(node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js get-node-info -u http://127.0.0.1:8080)

# Extract boot node ENR
export BOOTSTRAP_NODES=$(echo "$output" | grep -oP 'Node ENR: \K.*')

# Set environment variables
export LOG_LEVEL="debug"
export LOG_JSON="1"
export DEBUG="aztec:*"
export ETHEREUM_HOST="http://127.0.0.1:8545"
export PROVER_REAL_PROOFS="false"
export PROVER_AGENT_ENABLED="true"
export PROVER_PUBLISHER_PRIVATE_KEY="0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97"
export PROVER_COORDINATION_NODE_URL="http://127.0.0.1:8080"
export AZTEC_NODE_URL="http://127.0.0.1:8080"

# Start the Prover Node with the prover and archiver
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js start --port=8078 --prover-node --prover --archiver
