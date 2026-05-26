#!/usr/bin/env bash

set -euo pipefail

# Script to replace REPLACE_WITH_GCP_SECRET placeholders with actual GCP secrets
# Usage: setup_gcp_secrets.sh <env_file>

ENV_FILE="$1"

log_info() { echo "[setup_gcp_secrets] $*" >&2; }
log_err() { echo "[setup_gcp_secrets] ERROR: $*" >&2; }

if [[ ! -f "$ENV_FILE" ]]; then
    log_err "Environment file not found: $ENV_FILE"
    exit 1
fi

if ! command -v gcloud &>/dev/null; then
    log_err "gcloud not found on PATH"
    exit 1
fi

if ! command -v jq &>/dev/null; then
    log_err "jq not found on PATH (needed to inspect credentials)"
    exit 1
fi

function diagnose_gcloud_auth {
    log_info "CI=${CI:-0} GCP_PROJECT_ID=${GCP_PROJECT_ID:-<unset>} CLUSTER=${CLUSTER:-<unset>}"

    if [[ -z "${GCP_PROJECT_ID:-}" ]]; then
        log_err "GCP_PROJECT_ID is not set; gcloud secret access requires --project"
        return 1
    fi

    if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
        log_info "GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS}"
        if [[ ! -f "${GOOGLE_APPLICATION_CREDENTIALS}" ]]; then
            log_err "Credentials file does not exist: ${GOOGLE_APPLICATION_CREDENTIALS}"
            return 1
        fi
        local cred_type cred_email cred_project
        cred_type=$(jq -r '.type // "unknown"' "${GOOGLE_APPLICATION_CREDENTIALS}")
        cred_email=$(jq -r '.client_email // .client_id // "n/a"' "${GOOGLE_APPLICATION_CREDENTIALS}")
        cred_project=$(jq -r '.project_id // "n/a"' "${GOOGLE_APPLICATION_CREDENTIALS}")
        log_info "Credential file type=${cred_type} identity=${cred_email} file_project_id=${cred_project}"
        if [[ "$cred_project" != "n/a" && "$cred_project" != "$GCP_PROJECT_ID" ]]; then
            log_info "Note: file project_id (${cred_project}) differs from GCP_PROJECT_ID (${GCP_PROJECT_ID})"
        fi
    else
        log_info "GOOGLE_APPLICATION_CREDENTIALS is not set"
    fi

    log_info "Active gcloud accounts:"
    gcloud auth list 2>&1 | sed 's/^/[setup_gcp_secrets]   /' >&2 || true

    if [[ "${CI:-0}" == "1" && -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" && -f "${GOOGLE_APPLICATION_CREDENTIALS}" ]]; then
        log_info "CI=1: activating service account from GOOGLE_APPLICATION_CREDENTIALS"
        if ! gcloud auth activate-service-account --key-file="${GOOGLE_APPLICATION_CREDENTIALS}" 2>&1 | sed 's/^/[setup_gcp_secrets]   /' >&2; then
            log_err "gcloud auth activate-service-account failed"
            return 1
        fi
        gcloud config set project "$GCP_PROJECT_ID" >/dev/null
    fi

    local token_err
    token_err=$(mktemp)
    if ! gcloud auth print-access-token >/dev/null 2>"$token_err"; then
        log_err "Could not obtain a valid access token (expired or missing credentials?)"
        sed 's/^/[setup_gcp_secrets]   /' "$token_err" >&2
        rm -f "$token_err"
        return 1
    fi
    rm -f "$token_err"
    log_info "Access token obtained successfully for project ${GCP_PROJECT_ID}"

    local describe_err
    describe_err=$(mktemp)
    if ! gcloud secrets describe otel-collector-url --project="$GCP_PROJECT_ID" >/dev/null 2>"$describe_err"; then
        log_info "Preflight: cannot describe secret otel-collector-url (may still fail on access):"
        sed 's/^/[setup_gcp_secrets]   /' "$describe_err" >&2
    else
        log_info "Preflight: secret otel-collector-url exists in project ${GCP_PROJECT_ID}"
    fi
    rm -f "$describe_err"
}

diagnose_gcloud_auth || exit 1

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
    local gcloud_err
    gcloud_err=$(mktemp)

    if ! gcloud secrets versions access latest \
        --secret="$secret_name" \
        --project="$GCP_PROJECT_ID" \
        --out-file="$temp_file" 2>"$gcloud_err"; then
        log_err "Failed to read secret: ${secret_name} (project=${GCP_PROJECT_ID})"
        log_err "gcloud secrets versions access stderr:"
        sed 's/^/[setup_gcp_secrets]   /' "$gcloud_err" >&2
        rm -f "$gcloud_err"
        exit 1
    fi
    rm -f "$gcloud_err"

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
            if [[ -n "$element" ]]; then
                echo "::add-mask::$element"
            fi
        done
    elif [[ -n "$secret_value" ]]; then
        echo "::add-mask::$secret_value"
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

# Construct BLOB_FILE_STORE_UPLOAD_URL from the r2-account-id secret and BLOB_BUCKET_DIRECTORY
# Uses the same R2 bucket as snapshots but with a different directory for blobs
if [[ -n "${BLOB_BUCKET_DIRECTORY:-}" ]]; then
    secret_file=$(get_secret "r2-account-id")
    mask_secret_value "BLOB_FILE_STORE_UPLOAD_URL" "$secret_file"
    r2_account_id=$(cat "$secret_file")
    export BLOB_FILE_STORE_UPLOAD_URL="s3://testnet-bucket/${BLOB_BUCKET_DIRECTORY}/?endpoint=https://${r2_account_id}.r2.cloudflarestorage.com"
fi

# Construct TX_FILE_STORE_URL from the r2-account-id secret and TX_FILE_STORE_BUCKET_DIRECTORY
if [[ -n "${TX_FILE_STORE_BUCKET_DIRECTORY:-}" ]]; then
    secret_file=$(get_secret "r2-account-id")
    mask_secret_value "TX_FILE_STORE_URL" "$secret_file"
    r2_account_id=$(cat "$secret_file")
    export TX_FILE_STORE_URL="s3://testnet-bucket/${TX_FILE_STORE_BUCKET_DIRECTORY}/?endpoint=https://${r2_account_id}.r2.cloudflarestorage.com"
fi

echo "Successfully set up GCP secrets for $NETWORK"
