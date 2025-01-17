#!/bin/bash

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)
REPO=$(git rev-parse --show-toplevel)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# Deploys L2 contracts

set -eu

# Wait for PXE service to be ready
echo "Waiting for PXE service..."
until curl -s -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"pxe_getNodeInfo","params":[],"id":67}' \
  http://127.0.0.1:8079 | grep -q '"enr:-'; do
  sleep 1
done
echo "Done waiting."

# Get the chain ID from the Ethereum node
export ETHEREUM_HOST=${ETHEREUM_HOST:-"http://127.0.0.1:8545"}
source "$REPO"/yarn-project/end-to-end/scripts/native-network/utils/get-chain-id.sh
export L1_CHAIN_ID=${L1_CHAIN_ID:-31337}

# TODO(AD): Add option for prover-enabled mode
ARGS="--skipProofWait --l1-chain-id $L1_CHAIN_ID"

# Deploy L2 contracts
export AZTEC_NODE_URL="http://127.0.0.1:8080"
export PXE_URL="http://127.0.0.1:8079"
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js setup-protocol-contracts $ARGS
echo "Deployed L2 contracts"
# Use file just as done signal
echo "" > state/l2-contracts.env
echo "Wrote to state/l2-contracts.env to signal completion"
