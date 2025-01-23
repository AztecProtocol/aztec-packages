#!/bin/bash
set -eu
set -o pipefail

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)
PORT=8545

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# Starts the Ethereum node using Anvil

# Ensure anvil is installed
command -v anvil >/dev/null 2>&1 || { echo >&2 "Anvil is not installed. Aborting."; exit 1; }
function report_when_anvil_up() {
  echo "Starting anvil with port $PORT"
  until curl -s -X POST -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    http://127.0.0.1:$PORT 2>/dev/null | grep -q 'result' ; do
    sleep 1
  done
  echo "Anvil has started."
}
function filter_noise() {
  grep -Ev "^eth_[a-zA-Z]*$"
}

report_when_anvil_up &
STATE_DIR="$(git rev-parse --show-toplevel)/yarn-project/end-to-end/scripts/native-network/state"
STATE_FILE="$STATE_DIR/state.json"

mkdir -p "$STATE_DIR"

if [ -f "$STATE_FILE" ]; then
  echo "State file found. Loading existing state."
  anvil \
    --host 0.0.0.0 \
    --load-state "$STATE_DIR" \
    --dump-state "$STATE_DIR" \
    --block-time 12 \
    --chain-id 31337 \
    --gas-limit 1000000000 \
    --accounts 3 \
    -p $PORT 2>&1 | filter_noise
else
  echo "No state file found. Starting with a fresh state and enabling state dumping."
  anvil \
    --host 0.0.0.0 \
    --dump-state "$STATE_DIR" \
    --block-time 12 \
    --chain-id 31337 \
    --gas-limit 1000000000 \
    --accounts 3 \
    -p $PORT 2>&1 | filter_noise
fi