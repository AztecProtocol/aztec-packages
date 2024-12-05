#!/bin/bash
set -eu

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

# Set the token contract to use
export BOT_TOKEN_CONTRACT=${BOT_TOKEN_CONTRACT:-"TokenContract"}
export BOT_PXE_URL=${BOT_PXE_URL:-"http://127.0.0.1:8079"}

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# Starts the transaction bot
REPO=$(git rev-parse --show-toplevel)

echo "Waiting for Aztec Node..."
until curl -s http://127.0.0.1:8080/status >/dev/null; do
  sleep 1
done
echo "Waiting for PXE service..."
until curl -s -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"pxe_getNodeInfo","params":[],"id":67}' \
  $BOT_PXE_URL | grep -q '"enr:-'; do
  sleep 1
done

# Don't wait for l2 contracts if using EasyPrivateTokenContract
if [ "${BOT_TOKEN_CONTRACT:-TokenContract}" != "EasyPrivateTokenContract" ]; then
  echo "Waiting for l2 contracts to be deployed..."
  until [ -f "$REPO"/yarn-project/end-to-end/scripts/native-network/state/l2-contracts.env ]; do
    sleep 1
  done
  echo "Done waiting."
fi

# Set environment variables
export ETHEREUM_HOST=${ETHEREUM_HOST:-"http://127.0.0.1:8545"}
export AZTEC_NODE_URL=${AZTEC_NODE_URL:-"http://127.0.0.1:8080"}
export LOG_LEVEL=${LOG_LEVEL:-"verbose"}
export BOT_PRIVATE_KEY="0xcafe"
export BOT_TX_INTERVAL_SECONDS="5"
export BOT_PRIVATE_TRANSFERS_PER_TX="1"
export BOT_PUBLIC_TRANSFERS_PER_TX="0"
export BOT_NO_WAIT_FOR_TRANSFERS="true"
export BOT_FOLLOW_CHAIN="NONE"
export BOT_NO_START="false"
export PXE_PROVER_ENABLED="false"
export PROVER_REAL_PROOFS="false"

# Start the bot

node --no-warnings $REPO/yarn-project/aztec/dest/bin/index.js start --port=8077 --bot --pxe
