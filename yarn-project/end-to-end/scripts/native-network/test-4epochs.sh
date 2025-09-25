#!/usr/bin/env bash

set -eu

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

export BOOTNODE_URL=${BOOTNODE_URL:-http://127.0.0.1:8080}
export ETHEREUM_HOSTS=${ETHEREUM_HOSTS:-http://127.0.0.1:8545}

REPO=$(git rev-parse --show-toplevel)
# Run our test assuming the port in pxe.sh
# Wait for the Aztec Node to be ready
echo "Waiting for Aztec Node..."
until curl -s $BOOTNODE_URL/status >/dev/null; do
  sleep 1
done
echo "Waiting for l2 contracts to be deployed..."
until [ -f "$REPO"/yarn-project/end-to-end/scripts/native-network/state/l2-contracts.env ]; do
  sleep 1
done
echo "Done waiting."

export LOG_LEVEL=${LOG_LEVEL:-"verbose"}
cd $(git rev-parse --show-toplevel)/yarn-project/end-to-end
yarn test src/spartan/4epochs.test.ts
