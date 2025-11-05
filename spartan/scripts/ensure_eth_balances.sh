#!/usr/bin/env bash

set -euo pipefail

export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

# --- Argument Parsing ---
if [ "$#" -lt 2 ]; then
    echo "Usage: $0 ETHEREUM_HOST FUNDING_PRIVATE_KEY MNEMONIC_TO_FUND MNEMONIC_INDICES MIN_ETH_BALANCE [output_file]"
    echo "Example: $0 \"http://localhost:8545\" \"0x...\" \"test test ...\" \"0,1,2,100,101\" \"1.5\""
    exit 1
fi

ETHEREUM_HOST="$1"
FUNDING_PRIVATE_KEY="$2"
MNEMONIC_TO_FUND="$3"
MNEMONIC_INDICES="$4"
MIN_ETH_BALANCE="$5"
output_file="${6:-"mnemonic.tmp"}"

# ensure necessary environment variables are set
if [ -z "${ETHEREUM_HOST:-}" ]; then
  echo "ETHEREUM_HOST environment variable is not set"
  exit 1
fi
if [ -z "${FUNDING_PRIVATE_KEY:-}" ]; then
  echo "FUNDING_PRIVATE_KEY environment variable is not set"
  exit 1
fi

# --- Initial Setup ---
reset_x=false
# Set +x if it's currently enabled to avoid noisy output during setup
if [ -o xtrace ]; then
  set +x
  reset_x=true
fi

# Create a temporary file for the new mnemonic if one needs to be created
tmp_filename=$(mktemp)

# Cleanup function to handle the temp file and restore xtrace
cleanup() {
  rm -f "$tmp_filename"
  if [ "$reset_x" = true ]; then
    set -x
  fi
}
trap cleanup EXIT

# --- Dependency Checks ---
# Function to check for and install a command if it's missing
install_if_missing() {
    if ! command -v "$1" &>/dev/null; then
        echo "Command '$1' not found. Installing..."
        case "$1" in
            bc)
                (apt-get update && apt-get install -y bc) || (yum install -y bc) || (brew install bc) || echo "Please install 'bc' manually."
                ;;
            cast)
                # Adjust path for standard installations
                FOUNDRY_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/foundry"
                if [ ! -d "$FOUNDRY_DIR" ]; then
                  FOUNDRY_DIR="$HOME/.foundry"
                fi
                export PATH="$PATH:$FOUNDRY_DIR/bin"
                curl -L https://foundry.paradigm.xyz | bash
                "$FOUNDRY_DIR/bin/foundryup"
                ;;
            *)
                echo "Error: Don't know how to install '$1'."
                exit 1
                ;;
        esac
    fi
}

install_if_missing "bc"
install_if_missing "cast"

# --- Main Logic ---

# Validate and convert the target ETH amount to wei
if [[ ! "$MIN_ETH_BALANCE" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
  echo "Error: Invalid ETH amount provided: $MIN_ETH_BALANCE"
  exit 1
fi
target_wei_amount=$(cast to-wei "$MIN_ETH_BALANCE" ether)
echo "Ensuring each specified address has a minimum balance of $MIN_ETH_BALANCE ETH ($target_wei_amount wei)..."

# Check if a mnemonic is provided via environment variable, otherwise create one
# Initialize variables for the multicall transaction
calls="["
total_value_to_send=0
accounts_to_fund_count=0
accounts_already_funded_count=0

# Convert the comma-separated string of indices into a bash array
IFS=',' read -r -a indices_array <<< "$MNEMONIC_INDICES"

echo "Processing ${#indices_array[@]} mnemonic indices..."

for index in "${indices_array[@]}"; do
    # Trim whitespace from index
    index=$(echo "$index" | tr -d '[:space:]')
    if [ -z "$index" ]; then continue; fi

    echo -n "  -> Index $index: "
    address=$(cast wallet address --mnemonic "$MNEMONIC_TO_FUND" --mnemonic-index "$index")
    current_balance=$(cast balance --rpc-url "$ETHEREUM_HOST" "$address")

    # Check if the current balance is less than the target
    if (($(echo "$current_balance < $target_wei_amount" | bc -l))); then
        top_up_amount=$(echo "$target_wei_amount - $current_balance" | bc)
        echo "Balance is ${current_balance}. Topping up with ${top_up_amount} wei. Address: $address"

        # Add this funding operation to the multicall array
        calls+="(${address},false,${top_up_amount},0x),"

        # Add the top-up amount to the total value for the transaction
        total_value_to_send=$(echo "$total_value_to_send + $top_up_amount" | bc)
        accounts_to_fund_count=$((accounts_to_fund_count + 1))
    else
        echo "Balance is ${current_balance}. Sufficient funds. Address: $address"
        accounts_already_funded_count=$((accounts_already_funded_count + 1))
    fi
done

# --- Transaction Execution ---

# Only proceed if there are accounts that need funding
if [ "$accounts_to_fund_count" -eq 0 ]; then
    echo "All ${accounts_already_funded_count} specified accounts already have sufficient balance. No transaction needed."
    exit 0
fi

# Finalize the multicall array string
calls=${calls%,} # Remove trailing comma
calls+="]"

# Sanity check: ensure the total funding amount isn't excessive
funding_address=$(cast wallet address --private-key "$FUNDING_PRIVATE_KEY")
funding_balance=$(cast balance --rpc-url "$ETHEREUM_HOST" "$funding_address")
if (($(echo "$total_value_to_send > $funding_balance" | bc -l))); then
  echo "Error: Total value of this transaction ($total_value_to_send wei) exceeds funding account balance ($funding_balance wei)."
  exit 1
fi

multicall_address="0xcA11bde05977b3631167028862bE2a173976CA11" # Multicall3 contract on most chains

echo "Sending transaction to top up $accounts_to_fund_count accounts, total value to send $total_value_to_send..."
tx_hash=$(cast send "$multicall_address" \
  "aggregate3Value((address,bool,uint256,bytes)[])" \
  "$calls" \
  --value "$total_value_to_send" \
  --private-key "$FUNDING_PRIVATE_KEY" \
  --rpc-url "$ETHEREUM_HOST" \
  --json)

tx_hash_val=$(echo "$tx_hash" | jq -r '.transactionHash')

echo "--------------------------------------------------"
echo "✅ Funding complete!"
echo "Summary:"
echo " - Topped up: $accounts_to_fund_count accounts"
echo " - Already funded: $accounts_already_funded_count accounts"
echo " - Total ETH sent: $(cast from-wei "$total_value_to_send")"
echo " - Transaction Hash: $tx_hash_val"
echo "--------------------------------------------------"

