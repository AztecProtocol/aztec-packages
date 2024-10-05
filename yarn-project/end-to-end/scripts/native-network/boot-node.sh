#!/bin/bash
set -eu
# Starts the Boot Node

# Set environment variables
export PORT="8080"
export LOG_LEVEL="debug"
export LOG_JSON="1"
export DEBUG="aztec:*,-aztec:avm_simulator:*"
export ETHEREUM_HOST="http://127.0.0.1:8545"
export P2P_ENABLED="true"
export VALIDATOR_DISABLED="true"
export SEQ_MAX_SECONDS_BETWEEN_BLOCKS="0"
export SEQ_MIN_TX_PER_BLOCK="1"
export P2P_TCP_ANNOUNCE_ADDR="0.0.0.0:40400"
export P2P_UDP_ANNOUNCE_ADDR="0.0.0.0:40400"
export P2P_TCP_LISTEN_ADDR="0.0.0.0:40400"
export P2P_UDP_LISTEN_ADDR="0.0.0.0:40400"
export VALIDATOR_PRIVATE_KEY="0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
REPO=$(git rev-parse --show-toplevel)

echo "Waiting for l1 contracts to be deployed..."
until [ -f "$REPO"/yarn-project/end-to-end/scripts/native-network/l1-contracts.env ] ; do
  sleep 1
done

source "$REPO"/yarn-project/end-to-end/scripts/native-network/l1-contracts.env

# Wait for anvil and deploy contracts
# source this script to get the L1 contract addresses in env
source "$REPO"/yarn-project/end-to-end/scripts/native-network/deploy-l1-contracts.sh

# Start the Aztec node with the sequencer and archiver
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js start --node --archiver --sequencer --pxe
