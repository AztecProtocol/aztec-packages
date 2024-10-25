#!/bin/bash

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

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

# TODO(AD): Add option for prover-enabled mode
ARGS="--skipProofWait"

# Deploy L2 contracts
export AZTEC_NODE_URL="http://127.0.0.1:8080"
export PXE_URL="http://127.0.0.1:8079"
node --no-warnings $(git rev-parse --show-toplevel)/yarn-project/aztec/dest/bin/index.js setup-protocol-contracts $ARGS
echo "Deployed L2 contracts"
# Use file just as done signal
echo "" > state/l2-contracts.env
echo "Wrote to state/l2-contracts.env to signal completion"