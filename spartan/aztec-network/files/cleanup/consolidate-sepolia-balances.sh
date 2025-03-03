#!/bin/bash
set -exu

mnemonic=$1
# at least 2 accounts are needed for the validator and prover nodes
num_accounts=${2:-"2"}
funding_address=${3:-"0x33D525f5ac95c2BCf98b644738C7d5673480493A"}

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-"$HOME/.config"}

ETHEREUM_RPC_URL=$(echo "$ETHEREUM_HOSTS" | cut -d',' -f1)

# Install cast if needed
if ! command -v cast &>/dev/null; then
  curl -L https://foundry.paradigm.xyz | bash
  $HOME/.foundry/bin/foundryup && export PATH="$PATH:$HOME/.foundry/bin" ||
    $XDG_CONFIG_HOME/.foundry/bin/foundryup && export PATH="$PATH:$XDG_CONFIG_HOME/.foundry/bin"
fi

# For each index
for i in $(seq 0 $((num_accounts - 1))); do
  # Get address and private key for this index
  address=$(cast wallet address --mnemonic "$mnemonic" --mnemonic-index $i)
  private_key=$(cast wallet private-key --mnemonic "$mnemonic" --mnemonic-index $i)

  # Get balance
  balance=$(cast balance $address --rpc-url "$ETHEREUM_RPC_URL")

  if [ "$balance" != "0" ]; then
    gas_price=$(cast gas-price --rpc-url "$ETHEREUM_RPC_URL")
    gas_price=$((gas_price * 120 / 100)) # Add 20% to gas price
    gas_cost=$((21000 * gas_price))

    # Calculate amount to send (balance - gas cost)
    send_amount=$((balance - gas_cost))

    if [ "$send_amount" -gt "0" ]; then
      echo "Sending $send_amount wei from $address to $funding_address"
      cast send --private-key "$private_key" --rpc-url "$ETHEREUM_RPC_URL" "$funding_address" \
        --value "$send_amount" --gas-price "$gas_price" --async
    else
      echo "Balance too low to cover gas costs for $address"
    fi
  else
    echo "No balance in $address"
  fi
done
