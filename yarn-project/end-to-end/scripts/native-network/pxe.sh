#!/bin/bash
set -eu

# Starts the PXE (Private eXecution Environment) service
# Set environment variables
export ETHEREUM_HOST="http://127.0.0.1:8545"
export AZTEC_NODE_URL="http://127.0.0.1:8080"
export LOG_JSON="1"
export LOG_LEVEL="debug"
export DEBUG="aztec:*"
export PXE_PORT="http://127.0.0.1:8079"

echo "Waiting for Aztec Node..."
until curl -s http://127.0.0.1:8080/status >/dev/null ; do
  sleep 1
done

# Start the PXE service
node --no-warnings $(git rev-parse --show-toplevel)/yarn-project/aztec/dest/bin/index.js start --pxe
