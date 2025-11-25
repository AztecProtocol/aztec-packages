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
NETWORK=${NETWORK:-}

L1_NETWORK=${L1_NETWORK:-sepolia}

# Read optional custom secret name for LABS_INFRA_MNEMONIC
LABS_INFRA_MNEMONIC_SECRET_NAME=${LABS_INFRA_MNEMONIC_SECRET_NAME:-}

echo "Setting up GCP secrets for network: $NETWORK"

# Create secure temporary directory for secrets
SECRETS_TMP_DIR=$(mktemp -d)
chmod 700 "$SECRETS_TMP_DIR"
trap "rm -rf '$SECRETS_TMP_DIR'" EXIT

# Function to get secret from GCP Secret Manager and write to temp file
# Returns the path to the temp file containing the secret
get_secret() {
    local secret_name="$1"
    local temp_file="$SECRETS_TMP_DIR/${secret_name}.secret"

    gcloud secrets versions access latest --secret="$secret_name" --project="$GCP_PROJECT_ID" --out-file="$temp_file" 2>/dev/null || {
        echo "Failed to read secret: $secret_name" >&2
        exit 1
    }

    echo "$temp_file"
}

# Function to mask secret values from file - handles both plain strings and JSON
# Reads secret from temp file, masks it, and returns the value
mask_secret_value() {
    local env_var="$1"
    local secret_file="$2"

    # Read secret from file
    local secret_value
    secret_value=$(cat "$secret_file")

    # Always mask the full value first as a safety net
    echo "::add-mask::$secret_value"

    # Check if this environment variable contains JSON that should be individually masked
    local is_json_secret=false
    for json_var in "${JSON_SECRETS[@]}"; do
        if [[ "$env_var" == "$json_var" ]]; then
            is_json_secret=true
            break
        fi
    done

    if [[ "$is_json_secret" == "true" ]]; then
        jq -r '.[]' "$secret_file" | while IFS= read -r element; do
            echo "::add-mask::$element"
        done
    fi
}

# Determine the mnemonic secret name: use custom if provided, otherwise use default pattern
if [[ -n "$LABS_INFRA_MNEMONIC_SECRET_NAME" ]]; then
    MNEMONIC_SECRET="${LABS_INFRA_MNEMONIC_SECRET_NAME}"
else
    MNEMONIC_SECRET="${L1_NETWORK}-labs-${NETWORK}-mnemonic"
fi

# Map of environment variables to GCP secret names
# Generic mappings - network-specific secrets use ${NETWORK} in the name
declare -A SECRET_MAPPINGS=(
    ["ETHEREUM_RPC_URLS"]="${L1_NETWORK}-rpc-urls"
    ["ETHEREUM_CONSENSUS_HOST_URLS"]="${L1_NETWORK}-consensus-host-urls"
    ["ETHEREUM_CONSENSUS_HOST_API_KEYS"]="${L1_NETWORK}-consensus-host-api-keys"
    ["ETHEREUM_CONSENSUS_HOST_API_KEY_HEADERS"]="${L1_NETWORK}-consensus-host-api-key-headers"
    ["FUNDING_PRIVATE_KEY"]="${L1_NETWORK}-funding-private-key"
    ["ROLLUP_DEPLOYMENT_PRIVATE_KEY"]="${L1_NETWORK}-labs-rollup-private-key"
    ["OTEL_COLLECTOR_ENDPOINT"]="otel-collector-url"
    ["ETHERSCAN_API_KEY"]="etherscan-api-key"
    ["LABS_INFRA_MNEMONIC"]="${MNEMONIC_SECRET}"
    ["STORE_SNAPSHOT_URL"]="r2-account-id"
    ["R2_ACCESS_KEY_ID"]="r2-access-key-id"
    ["R2_SECRET_ACCESS_KEY"]="r2-secret-access-key"
)

# List of environment variables that contain JSON and should have individual values masked
JSON_SECRETS=(
    "ETHEREUM_RPC_URLS"
    "ETHEREUM_CONSENSUS_HOST_URLS"
    "ETHEREUM_CONSENSUS_HOST_API_KEYS"
    "ETHEREUM_CONSENSUS_HOST_API_KEY_HEADERS"
)

# Replace placeholders with actual secrets
for env_var in "${!SECRET_MAPPINGS[@]}"; do
    secret_name="${SECRET_MAPPINGS[$env_var]}"

    # Skip if the variable doesn't contain REPLACE_WITH_GCP_SECRET at all
    if ! grep -q "^${env_var}=.*REPLACE_WITH_GCP_SECRET" "$ENV_FILE"; then
        echo "Skipping $env_var (no placeholder value)"
        continue
    fi

    echo "Fetching secret: $secret_name for $env_var"

    if grep -q "^${env_var}=REPLACE_WITH_GCP_SECRET" "$ENV_FILE"; then
        # Export the secret value
        secret_file=$(get_secret "$secret_name")
        mask_secret_value "$env_var" "$secret_file"
        export $env_var="$(cat "$secret_file")"
    elif grep -q "^${env_var}=REPLACE_WITH_GCP_SECRET/" "$ENV_FILE"; then
        # Handle cases like STORE_SNAPSHOT_URL=REPLACE_WITH_GCP_SECRET/network/
        suffix=$(grep "^${env_var}=REPLACE_WITH_GCP_SECRET/" "$ENV_FILE" | cut -d'/' -f2-)
        secret_file=$(get_secret "$secret_name")
        mask_secret_value "$env_var" "$secret_file"
        export $env_var="$(cat $secret_file)/$suffix"
    elif grep -q "^${env_var}=.*REPLACE_WITH_GCP_SECRET" "$ENV_FILE"; then
        # Replace inline occurrences within the value, preserving surrounding content
        full_value=$(grep "^${env_var}=" "$ENV_FILE" | cut -d'=' -f2-)
        # Strip surrounding double quotes if present
        if [[ "$full_value" == \"*\" && "$full_value" == *\" ]]; then
            full_value="${full_value:1:-1}"
        fi
        secret_file=$(get_secret "$secret_name")
        mask_secret_value "$env_var" "$secret_file"
        secret_value="$(cat "$secret_file")"
        replaced_value="${full_value//REPLACE_WITH_GCP_SECRET/$secret_value}"
        export $env_var="$replaced_value"
    fi
done

# Construct STORE_SNAPSHOT_URL from the r2-account-id secret and SNAPSHOT_BUCKET_DIRECTORY
# This happens after secret replacement so the R2 account ID is available
if [[ -n "${SNAPSHOT_BUCKET_DIRECTORY:-}" ]]; then
    secret_file=$(get_secret "r2-account-id")
    mask_secret_value "STORE_SNAPSHOT_URL" "$secret_file"
    r2_account_id=$(cat "$secret_file")
    export STORE_SNAPSHOT_URL="s3://testnet-bucket/${SNAPSHOT_BUCKET_DIRECTORY}/?endpoint=https://${r2_account_id}.r2.cloudflarestorage.com&publicBaseUrl=https://aztec-labs-snapshots.com"
fi

echo "Successfully set up GCP secrets for $NETWORK"
