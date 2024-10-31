#!/bin/bash
set -eu
# Starts a validator node with specified port and private/public keys.

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# PORTS AND L1 ACCOUNT INFO
PORT="$1"
P2P_PORT="$2"
VALIDATOR_ADDRESS="$3"
VALIDATOR_PRIVATE_KEY="$4"

REPO=$(git rev-parse --show-toplevel)

echo "Waiting for l1 contracts to be deployed..."
until [ -f "$REPO"/yarn-project/end-to-end/scripts/native-network/state/l1-contracts.env ] ; do
  sleep 1
done

source "$REPO"/yarn-project/end-to-end/scripts/native-network/state/l1-contracts.env

echo "Waiting for Aztec Node..."
until curl -s http://127.0.0.1:8080/status >/dev/null ; do
  sleep 1
done
echo "Done waiting."

# Set the boot node URL
BOOT_NODE_URL="http://127.0.0.1:8080"

# Get node info from the boot node
output=$(node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js get-node-info -u $BOOT_NODE_URL)

# Extract boot node ENR
export BOOTSTRAP_NODES=$(echo "$output" | grep -oP 'Node ENR: \K.*')
echo "BOOTSTRAP_NODES: $BOOTSTRAP_NODES"

export ADDRESS=$VALIDATOR_ADDRESS
export LOG_LEVEL=${LOG_LEVEL:-"debug"}
export VALIDATOR_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY
export L1_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY
export SEQ_PUBLISHER_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY
export DEBUG=${DEBUG:-"aztec:*,-aztec:avm_simulator*,-aztec:libp2p_service*,-aztec:circuits:artifact_hash,-json-rpc*,-aztec:l2_block_stream,-aztec:world-state:*"}
export ETHEREUM_HOST="http://127.0.0.1:8545"
export P2P_ENABLED="true"
export VALIDATOR_DISABLED="false"
export SEQ_MAX_SECONDS_BETWEEN_BLOCKS="0"
export SEQ_MIN_TX_PER_BLOCK="1"
export P2P_TCP_ANNOUNCE_ADDR="127.0.0.1:$P2P_PORT"
export P2P_UDP_ANNOUNCE_ADDR="127.0.0.1:$P2P_PORT"
export P2P_TCP_LISTEN_ADDR="0.0.0.0:$P2P_PORT"
export P2P_UDP_LISTEN_ADDR="0.0.0.0:$P2P_PORT"
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT="${OTEL_EXPORTER_OTLP_METRICS_ENDPOINT:-}"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:-}"
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT="${OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:-}"

# Start the Validator Node with the sequencer and archiver
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js start --port="$PORT" --node --archiver --sequencer