#!/bin/bash
set -eu
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
