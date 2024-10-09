#!/bin/bash
set -eu

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# Starts the Ethereum node using Anvil

# Ensure anvil is installed
command -v anvil >/dev/null 2>&1 || { echo >&2 "Anvil is not installed. Aborting."; exit 1; }

function report_when_anvil_up() {
  echo "Starting anvil."
  until curl -s -X POST -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    http://127.0.0.1:8545 2>/dev/null | grep -q 'result' ; do
    sleep 1
  done
  echo "Anvil has started."
}
function filter_noise() {
  grep -Ev "eth_blockNumber|eth_getTransactionReceipt|eth_getBlockByNumber"
}

report_when_anvil_up &
# Start Anvil with specified parameters
anvil \
  --host 0.0.0.0 \
  --block-time 12 \
  --chain-id 31337 \
  --gas-limit 1000000000 \
  -p 8545 2>&1 | filter_noise
