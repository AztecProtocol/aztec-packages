#!/usr/bin/env bash

set -euo pipefail

# Script to ensure all publisher keys and bot accounts for an environment are funded
# Uses the existing ensure_eth_balances.sh script but calculates the correct indices
# Includes: validator publishers, prover publishers, bot transfers, and bot swaps

# Resolve spartan directory
spartan=$(git rev-parse --show-toplevel)/spartan

# --- Argument Parsing ---
if [ "$#" -lt 2 ]; then
    echo "Usage: $0 ENVIRONMENT_NAME FUNDING_PRIVATE_KEY [LOW_WATERMARK] [HIGH_WATERMARK]"
    echo ""
    echo "Arguments:"
    echo "  ENVIRONMENT_NAME     - Name of the environment (e.g., staging, next-net)"
    echo "  FUNDING_PRIVATE_KEY  - Private key with funds to distribute"
    echo "  LOW_WATERMARK        - Minimum ETH balance (default: 0.5)"
    echo "  HIGH_WATERMARK       - Target ETH balance when funding (default: 1.0)"
    echo ""
    echo "Example: $0 staging 0x1234... 0.5 1.0"
    exit 1
fi

ENVIRONMENT_NAME="$1"
FUNDING_PRIVATE_KEY="$2"
LOW_WATERMARK="${3:-0.5}"
HIGH_WATERMARK="${4:-1.0}"

# Locate the environment file
ENVIRONMENT_FILE="${spartan}/environments/${ENVIRONMENT_NAME}.env"

if [ ! -f "$ENVIRONMENT_FILE" ]; then
    echo "Error: Environment file not found: $ENVIRONMENT_FILE"
    echo "Available environments:"
    ls -1 "${spartan}/environments/" | grep -v '\.local\.env$' || echo "No environment files found"
    exit 1
fi

echo "==================================================="
echo "Ensuring Funded Environment: $ENVIRONMENT_NAME"
echo "==================================================="
echo ""

# Source the environment file to get configuration
source ${spartan}/scripts/source_network_env.sh
source_network_env "${ENVIRONMENT_NAME}"

if [ -z "${LABS_INFRA_MNEMONIC:-}" ] || [ "${LABS_INFRA_MNEMONIC}" == "REPLACE_WITH_GCP_SECRET" ]; then
    echo "Error: LABS_INFRA_MNEMONIC not properly set in environment file"
    exit 1
fi

if [ -n "${EXTERNAL_ETHEREUM_HOST:-}" ]; then
    ETHEREUM_HOST="${EXTERNAL_ETHEREUM_HOST}"
else
    if [ -z "${ETHEREUM_RPC_URLS:-}" ] || [ "${ETHEREUM_RPC_URLS}" == "REPLACE_WITH_GCP_SECRET" ]; then
        echo "Error: EXTERNAL_ETHEREUM_HOST is not set and ETHEREUM_RPC_URLS is not properly set in environment file"
        exit 1
    fi

    ETHEREUM_HOST=$(echo "${ETHEREUM_RPC_URLS}" | jq -r '.[0]')
fi

if [ -z "$ETHEREUM_HOST" ] || [ "$ETHEREUM_HOST" == "null" ] || [ "$ETHEREUM_HOST" == "REPLACE_WITH_GCP_SECRET" ]; then
    echo "Error: EXTERNAL_ETHEREUM_HOST is empty and could not extract RPC URL from ETHEREUM_RPC_URLS"
    exit 1
fi

echo "Low watermark: $LOW_WATERMARK ETH"
echo "High watermark: $HIGH_WATERMARK ETH"
echo ""

# Calculate all publisher and bot account indices using the helper script
echo "Calculating publisher and bot account indices..."
PUBLISHER_INDICES=$("${spartan}/scripts/calculate_publisher_indices.sh" "$ENVIRONMENT_NAME")

if [ -z "$PUBLISHER_INDICES" ]; then
    echo "Warning: No publisher/bot indices calculated. This may indicate a configuration issue."
    exit 1
fi

echo "Account indices: $PUBLISHER_INDICES"
echo ""

# Check each account and fund if below low watermark
echo "Checking account balances..."
echo ""

# We'll build a list of accounts that need funding
ACCOUNTS_TO_FUND=""
ACCOUNTS_ALREADY_FUNDED=0

# Convert the comma-separated string of indices into a bash array
IFS=',' read -r -a indices_array <<< "$PUBLISHER_INDICES"

for index in "${indices_array[@]}"; do
    # Trim whitespace from index
    index=$(echo "$index" | tr -d '[:space:]')
    if [ -z "$index" ]; then continue; fi

    address=$(cast wallet address --mnemonic "$LABS_INFRA_MNEMONIC" --mnemonic-index "$index")
    current_balance_wei=$(cast balance --rpc-url "$ETHEREUM_HOST" "$address")
    current_balance_eth=$(cast from-wei "$current_balance_wei" ether)

    # Convert to comparable format
    low_watermark_wei=$(cast to-wei "$LOW_WATERMARK" ether)

    # Check if the current balance is less than the low watermark
    if (($(echo "$current_balance_wei < $low_watermark_wei" | bc -l))); then
        echo "  Index $index ($address): $current_balance_eth ETH - NEEDS FUNDING"

        if [ -z "$ACCOUNTS_TO_FUND" ]; then
            ACCOUNTS_TO_FUND="$index"
        else
            ACCOUNTS_TO_FUND="${ACCOUNTS_TO_FUND},${index}"
        fi
    else
        echo "  Index $index ($address): $current_balance_eth ETH - OK"
        ACCOUNTS_ALREADY_FUNDED=$((ACCOUNTS_ALREADY_FUNDED + 1))
    fi
done

echo ""
echo "==================================================="
echo "Summary:"
echo "  - Already funded: $ACCOUNTS_ALREADY_FUNDED accounts"

if [ -z "$ACCOUNTS_TO_FUND" ]; then
    echo "  - Need funding: 0 accounts"
    echo ""
    echo "All publisher and bot accounts are sufficiently funded."
    echo "==================================================="
else
    # Count accounts to fund
    IFS=',' read -r -a accounts_to_fund_array <<< "$ACCOUNTS_TO_FUND"
    ACCOUNTS_TO_FUND_COUNT=${#accounts_to_fund_array[@]}

    echo "  - Need funding: $ACCOUNTS_TO_FUND_COUNT accounts"
    echo "==================================================="
    echo ""

    # Use the existing ensure_eth_balances.sh script to fund the accounts
    echo "Funding accounts to $HIGH_WATERMARK ETH..."
    "${spartan}/scripts/ensure_eth_balances.sh" \
        "$ETHEREUM_HOST" \
        "$FUNDING_PRIVATE_KEY" \
        "$LABS_INFRA_MNEMONIC" \
        "$ACCOUNTS_TO_FUND" \
        "$HIGH_WATERMARK"
fi

# --- Fund L1 Contract Deployer ---
echo ""
echo "==================================================="
echo "Checking L1 Contract Deployer"
echo "==================================================="
echo ""

if [ -z "${ROLLUP_DEPLOYMENT_PRIVATE_KEY:-}" ] || [ "${ROLLUP_DEPLOYMENT_PRIVATE_KEY}" == "REPLACE_WITH_GCP_SECRET" ]; then
    echo "ROLLUP_DEPLOYMENT_PRIVATE_KEY not set — skipping deployer funding."
else
    deployer_address=$(cast wallet address --private-key "$ROLLUP_DEPLOYMENT_PRIVATE_KEY")
    deployer_balance_wei=$(cast balance --rpc-url "$ETHEREUM_HOST" "$deployer_address")
    deployer_balance_eth=$(cast from-wei "$deployer_balance_wei" ether)
    low_watermark_wei=$(cast to-wei "$LOW_WATERMARK" ether)
    high_watermark_wei=$(cast to-wei "$HIGH_WATERMARK" ether)

    if (($(echo "$deployer_balance_wei < $low_watermark_wei" | bc -l))); then
        topup_wei=$(echo "$high_watermark_wei - $deployer_balance_wei" | bc)
        topup_eth=$(cast from-wei "$topup_wei" ether)
        echo "  Deployer ($deployer_address): $deployer_balance_eth ETH - NEEDS FUNDING"
        echo "  Sending $topup_eth ETH to deployer..."
        cast send \
            --rpc-url "$ETHEREUM_HOST" \
            --private-key "$FUNDING_PRIVATE_KEY" \
            --value "$topup_wei" \
            "$deployer_address"
        echo "  Deployer funded."
    else
        echo "  Deployer ($deployer_address): $deployer_balance_eth ETH - OK"
    fi
fi

echo ""
echo "✅ Environment funding complete!"
