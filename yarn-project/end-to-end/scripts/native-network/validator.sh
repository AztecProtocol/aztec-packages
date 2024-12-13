#!/bin/bash
set -eu

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# PORTS
PORT="$1"
P2P_PORT="$2"
ADDRESS="${3:-${ADDRESS:-}}"
export VALIDATOR_PRIVATE_KEY="${4:-${VALIDATOR_PRIVATE_KEY:-}}"

# Starts the Validator Node
REPO=$(git rev-parse --show-toplevel)

echo "Waiting for l1 contracts to be deployed..."
until [ -f "$REPO"/yarn-project/end-to-end/scripts/native-network/state/l1-contracts.env ]; do
  sleep 1
done

source "$REPO"/yarn-project/end-to-end/scripts/native-network/state/l1-contracts.env

echo "Waiting for Aztec Node..."
until curl -s http://127.0.0.1:8080/status >/dev/null; do
  sleep 1
done
echo "Done waiting."

# Set the boot node URL
BOOT_NODE_URL="http://127.0.0.1:8080"

# Get node info from the boot node
output=$(node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js get-node-info --node-url $BOOT_NODE_URL)

# Extract boot node ENR
export BOOTSTRAP_NODES=$(echo "$output" | grep -oP 'Node ENR: \K.*')
echo "BOOTSTRAP_NODES: $BOOTSTRAP_NODES"

# Generate a private key for the validator only if not already set
if [ -z "${VALIDATOR_PRIVATE_KEY:-}" ] || [ -z "${ADDRESS:-}" ]; then
  echo "Generating new L1 Validator account..."
  json_account=$(node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js generate-l1-account)
  export ADDRESS=$(echo $json_account | jq -r '.address')
  export VALIDATOR_PRIVATE_KEY=$(echo $json_account | jq -r '.privateKey')
fi

export L1_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY
export SEQ_PUBLISHER_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY
export DEBUG=${DEBUG:-""}
export LOG_LEVEL=${LOG_LEVEL:-"verbose"}
export ETHEREUM_HOST=${ETHEREUM_HOST:-"http://127.0.0.1:8545"}

# Automatically detect if we're using Anvil
if curl -s -H "Content-Type: application/json" -X POST --data '{"method":"web3_clientVersion","params":[],"id":49,"jsonrpc":"2.0"}' $ETHEREUM_HOST | jq .result | grep -q anvil; then
  IS_ANVIL="true"
else
  IS_ANVIL="false"
fi

export P2P_ENABLED="true"
export VALIDATOR_DISABLED="false"
export SEQ_MAX_SECONDS_BETWEEN_BLOCKS="0"
export SEQ_MIN_TX_PER_BLOCK="1"
export P2P_TCP_ANNOUNCE_ADDR="127.0.0.1:$P2P_PORT"
export P2P_UDP_ANNOUNCE_ADDR="127.0.0.1:$P2P_PORT"
export P2P_TCP_LISTEN_ADDR="0.0.0.0:$P2P_PORT"
export P2P_UDP_LISTEN_ADDR="0.0.0.0:$P2P_PORT"
export OTEL_RESOURCE_ATTRIBUTES="service.name=validator-node-${PORT}"
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT="${OTEL_EXPORTER_OTLP_METRICS_ENDPOINT:-}"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:-}"
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT="${OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:-}"

if [ -z "${ROLLUP_CONTRACT_ADDRESS:-}" ]; then
  echo "ROLLUP_CONTRACT_ADDRESS not set!" && exit 1
fi

# Check if validator is already registered
echo "Checking if validator is already registered..."
debug_output=$(node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js debug-rollup --rollup $ROLLUP_CONTRACT_ADDRESS)
if echo "$debug_output" | grep -q "Validators:.*$ADDRESS"; then
  echo "Validator $ADDRESS is already registered"
else
  echo $debug_output
  # Add L1 validator
  # this may fail, so try 3 times
  echo "Adding validator $ADDRESS..."
  for i in {1..3}; do
    node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js add-l1-validator --validator $ADDRESS --rollup $ROLLUP_CONTRACT_ADDRESS && break
    sleep 1
  done

  # Fast forward epochs if we're on an anvil chain
  if [ "$IS_ANVIL" = "true" ]; then
    node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js fast-forward-epochs --rollup $ROLLUP_CONTRACT_ADDRESS --count 1
  fi
fi

# Start the Validator Node with the sequencer and archiver
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js start --port="$PORT" --node --archiver --sequencer
