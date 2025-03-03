#!/bin/bash

set -euo pipefail

source $(git rev-parse --show-toplevel)/ci3/source

tmp_filename=$(mktemp)

# Cleanup function to handle the temp file
cleanup() {
  if [ -f "$tmp_filename" ]; then
    rm -f "$tmp_filename"
  fi
}

# Set up trap to call cleanup on script exit
trap cleanup EXIT

values_file=$1
eth_amount=${2:-"1"}
output_file=${3:-"mnemonic.tmp"}
XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-"$HOME/.config"}

value_yamls="../aztec-network/values/$values_file ../aztec-network/values.yaml"

num_validators=$(./read_value.sh "validator.replicas" $value_yamls)
num_provers=$(./read_value.sh "proverNode.replicas" $value_yamls)
num_bots=$(./read_value.sh "bot.replicas" $value_yamls)
num_accounts=$((num_validators + num_provers + num_bots))

# Install bc if needed
if ! command -v bc &>/dev/null; then
  echo "Installing bc..."
  apt-get update && apt-get install -y bc
fi

# Install cast if needed
if ! command -v cast &>/dev/null; then
  echo "Installing cast..."
  curl -L https://foundry.paradigm.xyz | bash
  $HOME/.foundry/bin/foundryup && export PATH="$PATH:$HOME/.foundry/bin" || $XDG_CONFIG_HOME/.foundry/bin/foundryup && export PATH="$PATH:$XDG_CONFIG_HOME/.foundry/bin"
fi

# Install yq if needed
if ! command -v yq &>/dev/null; then
  echo "Installing yq..."
  wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/local/bin/yq
  chmod +x /usr/local/bin/yq
fi

# Create a new mnemonic with the required number of accounts
echo "Creating mnemonic..."
cast wallet new-mnemonic --accounts "$num_accounts" --json >"$tmp_filename"
MNEMONIC=$(jq -r '.mnemonic' "$tmp_filename")
ADDRESSES=$(jq -r '.accounts[].address' "$tmp_filename")

# Convert ETH to wei
wei_amount=$(cast to-wei "$eth_amount" ether)

# Get current gas price and add 25% buffer
echo "Getting gas price..."
gas_price=$(cast gas-price --rpc-url "$ETHEREUM_HOST")
gas_price=$((gas_price * 125 / 100)) # Add 25% to gas price

# Build 'calls' string in the format:
# [(0xADDR,false,wei_amount,0x),(0xADDR2,false,wei_amount,0x)]
calls="["
for addr in $ADDRESSES; do
  calls+="(${addr},false,${wei_amount},0x),"
done
calls=${calls%,}
calls+="]"

# Total value = wei_amount * num_accounts
total_value=$(echo "$wei_amount * $num_accounts" | bc)

multicall_address="0xcA11bde05977b3631167028862bE2a173976CA11" # Sepolia Multicall3 contract

echo "Sending transaction..."
tx_hash=$(cast send "$multicall_address" \
  "aggregate3Value((address,bool,uint256,bytes)[])" \
  "$calls" \
  --value "$total_value" \
  --private-key "$FUNDING_PRIVATE_KEY" \
  --rpc-url "$ETHEREUM_HOST" \
  --json --gas-price "$gas_price")

echo "Sent ${wei_amount} wei to ${num_accounts} addresses in tx $tx_hash"

# Write mnemonic to output file
echo "$MNEMONIC" >"$output_file"
