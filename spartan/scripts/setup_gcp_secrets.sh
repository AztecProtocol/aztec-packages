#!/bin/bash

set -euo pipefail

# Script to replace REPLACE_WITH_GCP_SECRET placeholders with actual GCP secrets
# Usage: setup_gcp_secrets.sh <env_file>

ENV_FILE="$1"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Environment file not found: $ENV_FILE" >&2
    exit 1
fi

# Read the network name from the env file
NETWORK=$(grep "^NETWORK=" "$ENV_FILE" | cut -d'=' -f2)
if [[ -z "$NETWORK" ]]; then
    echo "NETWORK not found in environment file" >&2
    exit 1
fi

echo "Setting up GCP secrets for network: $NETWORK"

# Function to get secret from GCP Secret Manager
get_secret() {
    local secret_name="$1"
    gcloud secrets versions access latest --secret="$secret_name" 2>/dev/null || {
        echo "Failed to read secret: $secret_name" >&2
        exit 1
    }
}

# Map of environment variables to GCP secret names
# Generic mappings - network-specific secrets use ${NETWORK} in the name
declare -A SECRET_MAPPINGS=(
    ["ETHEREUM_RPC_URLS"]="sepolia-rpc-urls"
    ["ETHEREUM_CONSENSUS_HOST_URLS"]="sepolia-consensus-host-urls"
    ["ETHEREUM_CONSENSUS_HOST_API_KEYS"]="sepolia-consensus-host-api-keys"
    ["ETHEREUM_CONSENSUS_HOST_API_KEY_HEADERS"]="sepolia-consensus-host-api-key-headers"
    ["FUNDING_PRIVATE_KEY"]="sepolia-funding-private-key"
    ["ROLLUP_DEPLOYMENT_PRIVATE_KEY"]="sepolia-labs-rollup-private-key"
    ["OTEL_COLLECTOR_ENDPOINT"]="otel-collector-url"
    ["ETHERSCAN_API_KEY"]="etherscan-api-key"
    ["LABS_INFRA_MNEMONIC"]="sepolia-labs-${NETWORK}-mnemonic"
    ["STORE_SNAPSHOT_URL"]="r2-account-id"
    ["R2_ACCESS_KEY_ID"]="r2-access-key-id"
    ["R2_SECRET_ACCESS_KEY"]="r2-secret-access-key"
)

# Replace placeholders with actual secrets
for env_var in "${!SECRET_MAPPINGS[@]}"; do
    secret_name="${SECRET_MAPPINGS[$env_var]}"
    echo "Fetching secret: $secret_name for $env_var"

    if grep -q "^${env_var}=REPLACE_WITH_GCP_SECRET" "$ENV_FILE"; then
        # Export the secret value
        secret_value=$(get_secret "$secret_name")
        export $env_var="${secret_value}"
    elif grep -q "^${env_var}=REPLACE_WITH_GCP_SECRET/" "$ENV_FILE"; then
        # Handle cases like STORE_SNAPSHOT_URL=REPLACE_WITH_GCP_SECRET/network/
        suffix=$(grep "^${env_var}=REPLACE_WITH_GCP_SECRET/" "$ENV_FILE" | cut -d'/' -f2-)
        secret_value=$(get_secret "$secret_name")
        export $env_var='${secret_value}/'$suffix
    fi
done

echo "Successfully set up GCP secrets for $NETWORK"
