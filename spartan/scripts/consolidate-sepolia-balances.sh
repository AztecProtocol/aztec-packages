#!/usr/bin/env bash

# Helper script for consolidating balances on Sepolia, that were previously dispersed across multiple accounts.
# The script uses the mnemonic to get the accounts' private keys & calculate which ones were funded from a helm chart yaml.
# Usage: ./consolidate-sepolia-balances.sh <mnemonic> <funding_address> <values_file>
# Environment variables:
#   ETHEREUM_HOSTS (must be provided)

# IMPORTANT NOTE: The script should be the same as the one found in the consolidate-balances.yaml template.
# This standalone is left here for ad-hoc use if needed.

set -exu

mnemonic=$1
funding_address=${2:-"0x33D525f5ac95c2BCf98b644738C7d5673480493A"}
values_file=${3:-"ignition-testnet.yaml"}

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-"$HOME/.config"}

ETHEREUM_RPC_URL=$(echo "$ETHEREUM_HOSTS" | cut -d',' -f1)

# Install cast if needed
if ! command -v cast &>/dev/null; then
  curl -L https://foundry.paradigm.xyz | bash
  $HOME/.foundry/bin/foundryup && export PATH="$PATH:$HOME/.foundry/bin" ||
    $XDG_CONFIG_HOME/.foundry/bin/foundryup && export PATH="$PATH:$XDG_CONFIG_HOME/.foundry/bin"
fi

# Install bc if needed
if ! command -v bc &>/dev/null; then
  echo "Installing bc..."
  apt-get update && apt-get install -y bc
fi

# Get values from the values file
value_yamls="../aztec-network/values/$values_file ../aztec-network/values.yaml"

num_validator_nodes=$(./read_value.sh "validator.replicas" $value_yamls)
validators_per_node=$(./read_value.sh "validator.keysPerNode" $value_yamls)
num_validators=$((num_validator_nodes * validators_per_node))

num_provers=$(./read_value.sh "proverNode.replicas" $value_yamls)

# Get the key index start values
validator_key_index_start=$(./read_value.sh "aztec.validatorKeyIndexStart" $value_yamls)
prover_key_index_start=$(./read_value.sh "aztec.proverKeyIndexStart" $value_yamls)
bot_key_index_start=$(./read_value.sh "aztec.botKeyIndexStart" $value_yamls)
slasher_key_index_start=$(./read_value.sh "aztec.slasherKeyIndexStart" $value_yamls)

# bots might be disabled
bot_enabled=$(./read_value.sh "bot.enabled" $value_yamls)
if [ "$bot_enabled" = "true" ]; then
  num_bots=$(./read_value.sh "bot.replicas" $value_yamls)
else
  num_bots=0
fi

# Build an array of indices to check
declare -a indices_to_check

# Add validator indices
for ((i = 0; i < num_validators; i++)); do
  indices_to_check+=($((validator_key_index_start + i)))
done

# Add prover indices
for ((i = 0; i < num_provers; i++)); do
  indices_to_check+=($((prover_key_index_start + i)))
done

# Add bot indices if enabled
if [ "$bot_enabled" = "true" ]; then
  for ((i = 0; i < num_bots; i++)); do
    indices_to_check+=($((bot_key_index_start + i)))
  done
fi

# Add slasher indices (one per validator node)
for ((i = 0; i < num_validator_nodes; i++)); do
  indices_to_check+=($((slasher_key_index_start + i)))
done

echo "Checking balances for ${#indices_to_check[@]} accounts..."
echo "Total validators: $num_validators ($num_validator_nodes nodes with $validators_per_node validators each)"
echo "Total slashers: $num_validator_nodes (one per validator node)"

# For each index in our list
for i in "${indices_to_check[@]}"; do
  # Get address and private key for this index
  address=$(cast wallet address --mnemonic "$mnemonic" --mnemonic-index $i)
  private_key=$(cast wallet private-key --mnemonic "$mnemonic" --mnemonic-index $i)

  # Get balance
  balance=$(cast balance $address --rpc-url "$ETHEREUM_RPC_URL")

  if [ "$balance" != "0" ]; then
    gas_price=$(cast gas-price --rpc-url "$ETHEREUM_RPC_URL")
    gas_price=$((gas_price * 120 / 100)) # Add 20% to gas price
    gas_cost=$((21000 * gas_price))

    # Calculate amount to send (balance - gas cost) using bc for arbitrary precision
    send_amount=$(echo "$balance - $gas_cost" | bc)

    if [ "$(echo "$send_amount > 0" | bc)" -eq 1 ]; then
      echo "Sending $send_amount wei from $address (index $i) to $funding_address"
      cast send --private-key "$private_key" --rpc-url "$ETHEREUM_RPC_URL" "$funding_address" \
        --value "$send_amount" --gas-price "$gas_price" --async
    else
      echo "Balance too low to cover gas costs for $address (index $i)"
    fi
  else
    echo "No balance in $address (index $i)"
  fi
done
