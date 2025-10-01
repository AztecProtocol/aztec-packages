#!/usr/bin/env bash

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)
REPO=$(git rev-parse --show-toplevel)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# Deploys L2 contracts

set -eu

# Get the chain ID from the Ethereum node
export ETHEREUM_HOSTS=${ETHEREUM_HOSTS:-"http://127.0.0.1:8545"}
source "$REPO"/yarn-project/end-to-end/scripts/native-network/utils/get-chain-id.sh
export L1_CHAIN_ID=${L1_CHAIN_ID:-31337}

# TODO(AD): Add option for prover-enabled mode
ARGS="--skipProofWait --testAccounts"

# Deploy L2 contracts
export AZTEC_NODE_URL="http://127.0.0.1:8080"
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js setup-protocol-contracts $ARGS
echo "Deployed L2 contracts"
# Use file just as done signal
echo "" >state/l2-contracts.env
echo "Wrote to state/l2-contracts.env to signal completion"
