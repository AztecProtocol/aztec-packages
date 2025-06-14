#!/usr/bin/env bash
set -eu

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# PORTS
PORT="$1"
P2P_PORT="$2"
ADDRESS="${3:-${ADDRESS:-}}"
validator_private_key="${4:-${VALIDATOR_PRIVATE_KEY:-}}"

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

# Ethereum host required for the chain id script
export ETHEREUM_HOSTS=${ETHEREUM_HOSTS:-"http://127.0.0.1:8545"}

# Get the chain ID from the Ethereum node
source "$REPO"/yarn-project/end-to-end/scripts/native-network/utils/get-chain-id.sh
export L1_CHAIN_ID=${L1_CHAIN_ID:-31337}

# Set the boot node URL
BOOT_NODE_URL="http://127.0.0.1:8080"

# Get node info from the boot node
output=$(node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js get-node-info --node-url $BOOT_NODE_URL)

# Extract boot node ENR
export BOOTSTRAP_NODES=$(echo "$output" | grep -oP 'Node ENR: \K.*')
echo "BOOTSTRAP_NODES: $BOOTSTRAP_NODES"

# Generate a private key for the validator only if not already set
if [ -z "${validator_private_key:-}" ] || [ -z "${ADDRESS:-}" ]; then
  echo "Generating new L1 Validator account..."
  json_account=$(node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js generate-l1-account)
  export ADDRESS=$(echo $json_account | jq -r '.address')
  validator_private_key=$(echo $json_account | jq -r '.privateKey')
fi

## We want to use the private key from the cli
unset VALIDATOR_PRIVATE_KEY

export DEBUG=${DEBUG:-""}
export LOG_LEVEL=${LOG_LEVEL:-"verbose"}
export L1_CONSENSUS_HOST_URLS=${L1_CONSENSUS_HOST_URLS:-}
export P2P_ENABLED="true"
export VALIDATOR_DISABLED="false"
export SEQ_MIN_TX_PER_BLOCK="1"
export P2P_IP="127.0.0.1"
export P2P_PORT="$P2P_PORT"
export BLOB_SINK_URL="http://127.0.0.1:${BLOB_SINK_PORT:-5053}"
export L1_CHAIN_ID=${L1_CHAIN_ID:-31337}
export OTEL_RESOURCE_ATTRIBUTES="service.name=validator-node-${PORT}"
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT="${OTEL_EXPORTER_OTLP_METRICS_ENDPOINT:-}"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:-}"
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT="${OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:-}"

# Check if validator is already registered
echo "Checking if validator is already registered..."
debug_output=$(node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js debug-rollup --rollup $ROLLUP_CONTRACT_ADDRESS)
if echo "$debug_output" | grep -q "Validators:.*$ADDRESS"; then
  echo "Validator $ADDRESS is already registered"
else
  # Add L1 validator
  # this may fail, so try 3 times
  echo "Adding validator $ADDRESS..."
  for i in {1..3}; do
    node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js add-l1-validator --validator $ADDRESS --withdrawer $ADDRESS --rollup $ROLLUP_CONTRACT_ADDRESS && break
    sleep 15
  done
fi

# Start the Validator Node with the sequencer and archiver
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js start --port="$PORT" --node --archiver --sequencer --sequencer.validatorPrivateKeys="$validator_private_key"
