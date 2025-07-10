#!/usr/bin/env bash

set -euo pipefail

source $(git rev-parse --show-toplevel)/ci3/source

reset_x=false

# Set +x if it's currently enabled
if [ -o xtrace ]; then
  set +x
  reset_x=true
fi

tmp_filename=$(mktemp)
addresses_file=$(mktemp)

# Cleanup function to handle the temp files
cleanup() {
  if [ -f "$tmp_filename" ]; then
    rm -f "$tmp_filename"
  fi
  if [ -f "$addresses_file" ]; then
    rm -f "$addresses_file"
  fi
  if [ $reset_x = true ]; then
    set -x
  fi
}

# Set up trap to call cleanup on script exit
trap cleanup EXIT

values_file=$1
eth_amount=${2:-"1"}
output_file=${3:-"mnemonic.tmp"}
XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-"$HOME/.config"}

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

# Convert ETH to wei
if [[ ! "$eth_amount" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
  echo "Error: Invalid ETH amount: $eth_amount"
  exit 1
fi
wei_amount=$(cast to-wei "$eth_amount" ether)

value_yamls="../aztec-network/values/$values_file ../aztec-network/values.yaml"

# Get the number of replicas for each service
num_validators=$(./read_value.sh "validator.replicas" $value_yamls)
validators_per_node=$(./read_value.sh "validator.keysPerNode" $value_yamls)
num_provers=$(./read_value.sh "proverNode.replicas" $value_yamls)

# Get the key index start values
validator_key_index_start=$(./read_value.sh "aztec.validatorKeyIndexStart" $value_yamls)
prover_key_index_start=$(./read_value.sh "aztec.proverKeyIndexStart" $value_yamls)
bot_key_index_start=$(./read_value.sh "aztec.botKeyIndexStart" $value_yamls)

# bots might be disabled
bot_enabled=$(./read_value.sh "bot.enabled" $value_yamls)
if [ "$bot_enabled" = "true" ]; then
  num_bots=$(./read_value.sh "bot.replicas" $value_yamls)
else
  num_bots=0
fi

# Calculate the highest index needed
validator_max_index=$((validator_key_index_start + num_validators * validators_per_node - 1))
prover_max_index=$((prover_key_index_start + num_provers - 1))
bot_max_index=$([ "$bot_enabled" = "true" ] && echo $((bot_key_index_start + num_bots - 1)) || echo 0)

# Find the maximum index needed
max_index=$((validator_max_index > prover_max_index ? validator_max_index : prover_max_index))
max_index=$((max_index > bot_max_index ? max_index : bot_max_index))

# Total number of accounts needed
total_accounts=$((num_validators * validators_per_node + num_provers + num_bots))

# Check if mnemonic is provided
if [ "${MNEMONIC:-}" = "" ]; then
  # Create a new mnemonic
  echo "Creating mnemonic..."
  cast wallet new-mnemonic --json >"$tmp_filename"
  MNEMONIC=$(jq -r '.mnemonic' "$tmp_filename")

  echo "MNEMONIC:"
  echo "::add-mask::$MNEMONIC"
else
  echo "Using provided mnemonic"
fi

# Cast has a limit of 255 accounts per mnemonic command
# We'll need to derive accounts in batches
echo "Deriving $total_accounts accounts from mnemonic..."

# Function to derive address at a specific index
derive_address() {
  local index=$1
  local mnemonic=$2
  cast wallet address --mnemonic "$mnemonic" --mnemonic-index "$index"
}

# Build an array of indices to fund
declare -a indices_to_fund

# Add validator indices
for ((i = 0; i < num_validators; i++)); do
  indices_to_fund+=($((validator_key_index_start + validators_per_node * i)))
done

# Add prover indices
for ((i = 0; i < num_provers; i++)); do
  indices_to_fund+=($((prover_key_index_start + i)))
done

# Add bot indices if enabled
if [ "$bot_enabled" = "true" ]; then
  for ((i = 0; i < num_bots; i++)); do
    indices_to_fund+=($((bot_key_index_start + i)))
  done
fi

# Get the addresses to fund
calls="["
num_accounts_to_fund=${#indices_to_fund[@]}

echo "Deriving addresses for $num_accounts_to_fund accounts to fund..."
for index in "${indices_to_fund[@]}"; do
  address=$(derive_address "$index" "$MNEMONIC")
  calls+="(${address},false,${wei_amount},0x),"
done
calls=${calls%,}
calls+="]"

# Get current gas price and add 25% buffer
echo "Getting gas price..."
gas_price=$(cast gas-price --rpc-url "$ETHEREUM_HOST")
gas_price=$((gas_price * 125 / 100)) # Add 25% to gas price

# Total value = wei_amount * num_accounts_to_fund
total_value=$(echo "$wei_amount * $num_accounts_to_fund" | bc)

# Check that we're not sending more than 50% of the funding account balance
funding_address=$(cast wallet address --private-key "$FUNDING_PRIVATE_KEY")
funding_balance=$(cast balance --rpc-url "$ETHEREUM_HOST" "$funding_address")
half_balance=$(echo "$funding_balance / 2" | bc)
if (($(echo "$total_value > $half_balance" | bc -l))); then
  echo "Error: Total value of this tx exceeds 50% of funding account balance"
  exit 1
fi

multicall_address="0xcA11bde05977b3631167028862bE2a173976CA11" # Sepolia Multicall3 contract

echo "Sending transaction to fund $num_accounts_to_fund accounts..."
tx_hash=$(cast send "$multicall_address" \
  "aggregate3Value((address,bool,uint256,bytes)[])" \
  "$calls" \
  --value "$total_value" \
  --private-key "$FUNDING_PRIVATE_KEY" \
  --rpc-url "$ETHEREUM_HOST" \
  --json --gas-price "$gas_price")

echo "Sent ${wei_amount} wei to ${num_accounts_to_fund} addresses in tx $tx_hash"
echo "Funded accounts for:"
echo "- $num_validators validators (starting at index $validator_key_index_start)"
echo "- $num_provers provers (starting at index $prover_key_index_start)"
if [ "$bot_enabled" = "true" ]; then
  echo "- $num_bots bots (starting at index $bot_key_index_start)"
fi

# Write mnemonic to output file
echo "$MNEMONIC" >"$output_file"
