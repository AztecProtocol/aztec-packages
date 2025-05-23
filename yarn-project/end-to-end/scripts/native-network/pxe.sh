#!/usr/bin/env bash
set -eu

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)
REPO=$(git rev-parse --show-toplevel)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# Starts the PXE (Private eXecution Environment) service
# Set environment variables
export ETHEREUM_HOSTS=${ETHEREUM_HOSTS:-"http://127.0.0.1:8545"}
export L1_CONSENSUS_HOST_URLS=${L1_CONSENSUS_HOST_URLS:-}
export AZTEC_NODE_URL=${AZTEC_NODE_URL:-"http://127.0.0.1:8080"}
export VALIDATOR_NODE_URL=${VALIDATOR_NODE_URL:-"http://127.0.0.1:8081"}
export LOG_LEVEL=${LOG_LEVEL:-"verbose"}

echo "Waiting for Aztec Node..."
until curl -s $AZTEC_NODE_URL/status >/dev/null; do
  sleep 1
done

# Get the chain ID from the Ethereum node
source "$REPO"/yarn-project/end-to-end/scripts/native-network/utils/get-chain-id.sh
export L1_CHAIN_ID=${L1_CHAIN_ID:-31337}

# We need to also wait for the validator, as the initial node cannot
# Produce blocks on it's own
echo "Waiting for Validator 0..."
until curl -s $VALIDATOR_NODE_URL/status >/dev/null; do
  sleep 1
done
echo "Done waiting."

function filter_noise() {
  grep -v node_getProvenBlockNumber
}

# Start the PXE service
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js start --port=8079 --pxe 2>&1 | filter_noise
