#!/bin/bash

set -euo pipefail

# Script to replace REPLACE_WITH_GCP_SECRET placeholders with actual GCP secrets
# Usage: setup_gcp_secrets.sh <env_file> <docker_image>

ENV_FILE="$1"
DOCKER_IMAGE="$2"

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

# Create temporary file for processing
TEMP_FILE=$(mktemp)
cp "$ENV_FILE" "$TEMP_FILE"

# Replace AZTEC_DOCKER_IMAGE with provided image
sed -i "s|^AZTEC_DOCKER_IMAGE=.*|AZTEC_DOCKER_IMAGE=\"$DOCKER_IMAGE\"|" "$TEMP_FILE"
echo "AZTEC_DOCKER_IMAGE=\"$DOCKER_IMAGE\"" >> "$TEMP_FILE"

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
    ["STORE_SNAPSHOT_URL"]="gcs-testnet-snapshot-url"
    ["LABS_INFRA_MNEMONIC"]="sepolia-labs-${NETWORK}-mnemonic"
)

# Replace placeholders with actual secrets
for env_var in "${!SECRET_MAPPINGS[@]}"; do
    secret_name="${SECRET_MAPPINGS[$env_var]}"
    echo "Fetching secret: $secret_name for $env_var"

    # Get secret and preserve quotes by writing directly to temp file
    if grep -q "^${env_var}=REPLACE_WITH_GCP_SECRET" "$TEMP_FILE"; then
        # Remove the old line and add the new one
        grep -v "^${env_var}=REPLACE_WITH_GCP_SECRET" "$TEMP_FILE" > "$TEMP_FILE.new"
        printf '%s=' "$env_var" >> "$TEMP_FILE.new"
        printf "'" >> "$TEMP_FILE.new"
        get_secret "$secret_name" | tr -d '\n' >> "$TEMP_FILE.new"
        printf "'\n" >> "$TEMP_FILE.new"
        mv "$TEMP_FILE.new" "$TEMP_FILE"
    elif grep -q "^${env_var}=REPLACE_WITH_GCP_SECRET/" "$TEMP_FILE"; then
        # Handle cases like STORE_SNAPSHOT_URL=REPLACE_WITH_GCP_SECRET/network/
        suffix=$(grep "^${env_var}=REPLACE_WITH_GCP_SECRET/" "$TEMP_FILE" | cut -d'/' -f2-)
        grep -v "^${env_var}=REPLACE_WITH_GCP_SECRET/" "$TEMP_FILE" > "$TEMP_FILE.new"
        printf '%s=' "$env_var" >> "$TEMP_FILE.new"
        printf "'" >> "$TEMP_FILE.new"
        get_secret "$secret_name" | tr -d '\n' >> "$TEMP_FILE.new"
        printf "/%s'\n" "$suffix" >> "$TEMP_FILE.new"
        mv "$TEMP_FILE.new" "$TEMP_FILE"
    fi
done

# Move the processed file back
mv "$TEMP_FILE" "$ENV_FILE"

echo "Successfully set up GCP secrets for $NETWORK"
