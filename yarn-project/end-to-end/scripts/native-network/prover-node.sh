#!/usr/bin/env bash
set -eu

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

PORT="$1"
export PROVER_REAL_PROOFS="$2"

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# Starts the Prover Node
REPO=$(git rev-parse --show-toplevel)

echo "Waiting for l1 contracts to be deployed..."
until [ -f "$REPO"/yarn-project/end-to-end/scripts/native-network/state/l1-contracts.env ]; do
  sleep 1
done

# Get the chain ID from the Ethereum node
export ETHEREUM_HOSTS=${ETHEREUM_HOSTS:-"http://127.0.0.1:8545"}
source "$REPO"/yarn-project/end-to-end/scripts/native-network/utils/get-chain-id.sh

echo "Waiting for Aztec Node..."
until curl -s http://127.0.0.1:8080/status >/dev/null; do
  sleep 1
done
echo "Done waiting."

source "$REPO"/yarn-project/end-to-end/scripts/native-network/state/l1-contracts.env

# Get node info from the boot node
output=$(node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js get-node-info --node-url http://127.0.0.1:8080)

# Extract boot node ENR
export BOOTSTRAP_NODES=$(echo "$output" | grep -oP 'Node ENR: \K.*')

# Set environment variables
export LOG_LEVEL=${LOG_LEVEL:-"verbose"}
export DEBUG=${DEBUG:-""}
export L1_CONSENSUS_HOST_URLS=${L1_CONSENSUS_HOST_URLS:-}
export PROVER_AGENT_COUNT="1"
export PROVER_AGENT_ENABLED="true"
export PROVER_PUBLISHER_PRIVATE_KEY=${PROVER_PUBLISHER_PRIVATE_KEY:-"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"}
export PROVER_COORDINATION_NODE_URL="http://127.0.0.1:8080"
export BLOB_SINK_URL="http://127.0.0.1:${BLOB_SINK_PORT:-5053}"
export AZTEC_NODE_URL="http://127.0.0.1:8080"
export OTEL_RESOURCE_ATTRIBUTES="service.name=prover-node-${PORT}"
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT="${OTEL_EXPORTER_OTLP_METRICS_ENDPOINT:-}"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:-}"
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT="${OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:-}"
export TEST_ACCOUNTS="true"

# Start the Prover Node with the prover and archiver
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js start --port="$PORT" --prover-node --prover-broker --archiver
