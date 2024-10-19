#!/bin/bash
set -eu

export PROVER_REAL_PROOFS="$1"
# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

PORT="$2"

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# Starts the Prover Node
REPO=$(git rev-parse --show-toplevel)

echo "Waiting for l1 contracts to be deployed..."
until [ -f "$REPO"/yarn-project/end-to-end/scripts/native-network/l1-contracts.env ] ; do
  sleep 1
done
echo "Waiting for Aztec Node..."
until curl -s http://127.0.0.1:8080/status >/dev/null ; do
  sleep 1
done
echo "Done waiting."

source "$REPO"/yarn-project/end-to-end/scripts/native-network/l1-contracts.env

# Get node info from the boot node
output=$(node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js get-node-info -u http://127.0.0.1:8080)

# Extract boot node ENR
export BOOTSTRAP_NODES=$(echo "$output" | grep -oP 'Node ENR: \K.*')

# Set environment variables
export LOG_LEVEL="debug"
export DEBUG="aztec:*"
export ETHEREUM_HOST="http://127.0.0.1:8545"
export PROVER_AGENT_ENABLED="true"
export PROVER_PUBLISHER_PRIVATE_KEY="0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97"
export PROVER_ADDRESS="0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f"
export PROVER_COORDINATION_NODE_URL="http://127.0.0.1:8080"
export AZTEC_NODE_URL="http://127.0.0.1:8080"
export PROVER_JOB_SOURCE_URL="http://127.0.0.1:$PORT"
LARGE_PROVER_ETH_BALANCE=10000000

# Make sure we don't run out of funds
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js cheat-code-set-l1-balance --l1-rpc-url $ETHEREUM_HOST $PROVER_ADDRESS $LARGE_PROVER_ETH_BALANCE
# Start the Prover Node with the prover and archiver
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js start --port="$PORT" --prover-node --prover --archiver
