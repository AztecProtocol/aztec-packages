#!/bin/bash
set -eu

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# Starts the Ethereum node using Anvil

# Ensure anvil is installed
command -v anvil >/dev/null 2>&1 || { echo >&2 "Anvil is not installed. Aborting."; exit 1; }

# Start Anvil with specified parameters
anvil \
  --host 0.0.0.0 \
  --block-time 12 \
  --chain-id 31337 \
  --gas-limit 1000000000 \
  -p 8545
