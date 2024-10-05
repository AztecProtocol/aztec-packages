#!/bin/bash
set -eu
# Starts the transaction bot

# Wait for the Aztec Node to be ready
echo "Waiting for Aztec Node..."
until curl -s http://127.0.0.1:8080/status; do
  sleep 1
done

echo "Waiting for l2 contracts to be deployed..."
until [ -f "$REPO"/yarn-project/end-to-end/scripts/native-network/l2-contracts.env ] ; do
  sleep 1
done

# Set environment variables
export ETHEREUM_HOST="http://127.0.0.1:8545"
export AZTEC_NODE_URL="http://127.0.0.1:8080"
export LOG_JSON="1"
export LOG_LEVEL="debug"
export DEBUG="aztec:*"
export BOT_PRIVATE_KEY="0xcafe"
export BOT_TX_INTERVAL_SECONDS="5"
export BOT_PRIVATE_TRANSFERS_PER_TX="1"
export BOT_PUBLIC_TRANSFERS_PER_TX="0"
export BOT_NO_WAIT_FOR_TRANSFERS="true"
export BOT_NO_START="false"
export PXE_PROVER_ENABLED="false"
export PROVER_REAL_PROOFS="false"

# Start the bot
node --no-warnings $(git rev-parse --show-toplevel)/yarn-project/aztec/dest/bin/index.js start --pxe --bot
