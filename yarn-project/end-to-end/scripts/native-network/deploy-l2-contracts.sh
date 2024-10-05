#!/bin/bash

# Deploys L2 contracts

set -eu

# Wait for PXE service to be ready
echo "Waiting for PXE service..."
until curl -s -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"pxe_getNodeInfo","params":[],"id":67}' \
  http://127.0.0.1:8079 | grep -q '"enr:-'; do
  sleep 1
done
echo "PXE service is ready!"

# Deploy L2 contracts
export AZTEC_NODE_URL="http://127.0.0.1:8080"
node --no-warnings $(git rev-parse --show-toplevel)/yarn-project/aztec/dest/bin/index.js deploy-protocol-contracts
echo "Deployed L2 contracts"
# Use file just as done signal
echo "" > l2-contracts.env