#!/bin/bash
set -eu

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

export PORT="$1"

# Starts the Validator Node
REPO=$(git rev-parse --show-toplevel)

echo "Waiting for l1 contracts to be deployed..."
until [ -f "$REPO"/yarn-project/end-to-end/scripts/native-network/l1-contracts.env ] ; do
  sleep 1
done

source "$REPO"/yarn-project/end-to-end/scripts/native-network/l1-contracts.env

echo "Waiting for Aztec Node..."
until curl -s http://127.0.0.1:8080/status >/dev/null ; do
  sleep 1
done

# Set the boot node URL
BOOT_NODE_URL="http://127.0.0.1:8080"

# Get node info from the boot node
output=$(node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js get-node-info -u $BOOT_NODE_URL)

# Extract boot node ENR
export BOOTSTRAP_NODES=$(echo "$output" | grep -oP 'Node ENR: \K.*')

# Generate a private key for the validator
json_account=$(node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js generate-l1-account)
export ADDRESS=$(echo $json_account | jq -r '.address')
export VALIDATOR_PRIVATE_KEY=$(echo $json_account | jq -r '.privateKey')
export L1_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY
export SEQ_PUBLISHER_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY
export LOG_LEVEL="debug"
export LOG_JSON="1"
export DEBUG="aztec:*,-aztec:avm_simulator:*"
export ETHEREUM_HOST="http://127.0.0.1:8545"
export P2P_ENABLED="true"
export VALIDATOR_DISABLED="false"
export SEQ_MAX_SECONDS_BETWEEN_BLOCKS="0"
export SEQ_MIN_TX_PER_BLOCK="1"
export P2P_TCP_ANNOUNCE_ADDR="0.0.0.0:40400"
export P2P_UDP_ANNOUNCE_ADDR="0.0.0.0:40400"
export P2P_TCP_LISTEN_ADDR="0.0.0.0:40400"
export P2P_UDP_LISTEN_ADDR="0.0.0.0:40400"

# Add L1 validator
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js add-l1-validator --validator $ADDRESS --rollup $ROLLUP_CONTRACT_ADDRESS
# Fast forward epochs
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js fast-forward-epochs --rollup $ROLLUP_CONTRACT_ADDRESS --count 1
# Start the Validator Node with the sequencer and archiver
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js start --node -- --archiver --sequencer
