#!/bin/bash

# Script to check that all environment variables used in Helm templates, values files, and Terraform scripts
# are defined in yarn-project/foundation/src/config/env_var.ts
#
# This script scans:
# - Helm templates in spartan/aztec-*/templates/ directories (excluding aztec-network) for "- name: VAR_NAME" patterns
# - Helm values files in spartan/aztec-*/ (excluding aztec-network) and spartan/terraform/deploy-aztec-infra/values/ for "VAR_NAME:" patterns
# - Terraform files in spartan/terraform/deploy-aztec-infra/ for env vars set via Helm chart values: "*.env.VAR_NAME"
#   (Note: Terraform input variables are NOT scanned, only actual env vars passed to the application)
#
# It then checks if each found environment variable is defined in the TypeScript EnvVar union type.
# Variables in the exclusion list (system/k8s/deployment-specific vars) are ignored.
#
# Usage:
#   ./check-env-vars.sh        # Basic check
#   VERBOSE=1 ./check-env-vars.sh   # Show all found variables
#
# Exit codes:
#   0 - All environment variables are properly defined
#   1 - Some environment variables are missing from env_var.ts

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the project root directory (assuming script is in spartan/scripts)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Files to check
ENV_VAR_FILE="$PROJECT_ROOT/yarn-project/foundation/src/config/env_var.ts"
HELM_CHARTS_DIR="$PROJECT_ROOT/spartan"
TERRAFORM_DIR="$PROJECT_ROOT/spartan/terraform"

echo -e "${YELLOW}Checking environment variables in Helm templates and Terraform scripts...${NC}"

# Variables that are excluded from validation (system vars, k8s vars, deployment vars, etc.)
# Build the regex pattern from an array for better readability
EXCLUDED_VARS_ARRAY=(
    # Kubernetes injected variables
    "K8S_POD_NAME"
    "K8S_POD_UID"
    "K8S_NAMESPACE_NAME"
    "POD_IP"
    "POD_NAME"
    "NODE_NAME"

    # System environment variables
    "PATH"
    "HOME"
    "USER"
    "SHELL"

    # Service/container specific vars that may not be in env_var.ts
    "OTEL_SERVICE_NAME"
    "OTEL_RESOURCE_ATTRIBUTES"
    "SERVICE_NAME"
    "NAMESPACE"
    "OTEL_COLLECTOR_ENDPOINT"

    # Helm template variables (not actual env vars)
    "RELEASE_NAME"
    "CHART_NAME"

    # External service variables that may not be managed by the app
    "ETH_BEACON_URL"
    "ETH_EXECUTION_URL"
    "ENGINE_PORT"
    "HTTP_PORT"
    "WS_PORT"
    "BEACON_HTTP_PORT"
    "MAX_TX_INPUT_SIZE_BYTES"

    # AWS/Cloud credentials (should be managed via secrets, not env_var.ts)
    "AWS_ACCESS_KEY_ID"
    "AWS_SECRET_ACCESS_KEY"

    # Hardware configuration
    "HARDWARE_CONCURRENCY"

    # Network/infrastructure variables
    "NETWORK_PUBLIC"
    "EXTERNAL_ETHEREUM_HOSTS"
    "EXTERNAL_ETHEREUM_CONSENSUS_HOST"
    "EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY"
    "EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY_HEADER"
    "EXTERNAL_BOOT_NODE_HOST"
    "EXTERNAL_FULL_NODE_HOST"
    "EXTERNAL_PROVER_NODE_HOST"
    "ETHEREUM_PORT"
    "ETHEREUM_CONSENSUS_PORT"
    "BOOT_NODE_PORT"
    "FULL_NODE_PORT"
    "PROVER_NODE_PORT"
    "PROVER_BROKER_PORT"
    "BOOT_NODE_HOST"
    "FULL_NODE_HOST"

    # Deployment and CI/CD specific variables
    "ACCELERATED_TEST_DEPLOYMENTS"
    "ARCHIVE_NODE_VALUES"
    "AZTEC_DOCKER_IMAGE"
    "AZTEC_PROOF_SUBMISSION_WINDOW"
    "BLOCK_TIME"
    "BOOTNODE_IP_REGION"
    "BOT_VALUES"
    "CHAIN_ID"
    "CREATE_STATIC_IPS"
    "DEPLOYMENT_MNEMONIC"
    "ETH_DEVNET_VALUES"
    "EXPOSE_HTTPS_BOOTNODE"
    "GAS_LIMIT"
    "GCP_PROJECT"
    "GCP_REGION"
    "GKE_CLUSTER_CONTEXT"
    "GRAFANA_PASSWORD_SECRET_NAME"
    "HOSTNAME"
    "INIT_VALIDATORS"

    # Job/workflow specific variables
    "JOB_BACKOFF_LIMIT"
    "JOB_NAME"
    "JOB_TTL_SECONDS_AFTER_FINISHED"
    "K8S_CLUSTER_CONTEXT"
    "K8S_MODE"
    "KEY_INDEX_START"
    "L1_DEPLOYMENT_MNEMONIC"
    "L1_DEPLOYMENT_PRIVATE_KEY"
    "L1_DEPLOYMENT_SALT"
    "L1_RPC_URLS"
    "LOGS"
    "METRICS_NAMESPACE"
    "MNEMONIC_SECRET_NAME"
    "NODE_OPTIONS"
    "NODE_RPC_VALUES"
    "NUMBER_OF_VALIDATOR_NODES"

    # Resource and configuration variables
    "P2P_BOOTSTRAP_RESOURCE_PROFILE"
    "PREFUNDED_MNEMONIC_INDICES"
    "PROVER_KEY_START"
    "PROVER_MNEMONIC"
    "PROVER_RESOURCE_PROFILE"
    "PROVER_VALUES"
    "REAL_VERIFIER"
    "RELEASE_PREFIX"
    "RESOURCE_PROFILE"
    "RESOURCES_FILE"
    "RPC_EXTERNAL_INGRESS"
    "RPC_HOSTNAME"
    "RPC_RESOURCE_PROFILE"
    "RPC_VALUES"
    "SALT"
    "SERVICE"
    "SLACK_WEBHOOK_SECRET_NAME"
    "SLACK_WEBHOOK_STAGING_PUBLIC_SECRET_NAME"
    "SLACK_WEBHOOK_STAGING_IGNITION_SECRET_NAME"
    "SLACK_WEBHOOK_NEXT_SCENARIO_SECRET_NAME"
    "SLACK_WEBHOOK_NEXT_NET_SECRET_NAME"
    "SLACK_WEBHOOK_TESTNET_SECRET_NAME"
    "SLACK_WEBHOOK_MAINNET_SECRET_NAME"
    "SLASHER_KEY_INDEX_START"
    "SNAPSHOT_VALUES"

    # Validator and node specific variables
    "VALIDATOR_KEY_START"
    "VALIDATOR_MNEMONIC"
    "VALIDATOR_MNEMONIC_START_INDEX"
    "VALIDATOR_REPLICAS"
    "VALIDATOR_RESOURCE_PROFILE"
    "VALIDATORS"
    "VALIDATORS_PER_NODE"
    "VALIDATOR_VALUES"
    "VALUES_FILE"
    "PUBLISHER_KEY_INDEX_START"
    "PUBLISHERS_PER_VALIDATOR_KEY"
    "PUBLISHERS_PER_PROVER"
    "AGENT_COUNT"
)

# Join array elements with | for regex
EXCLUDED_VARS=$(IFS='|'; echo "${EXCLUDED_VARS_ARRAY[*]}")

# Extract environment variables from Helm templates
echo "Scanning Helm templates..."
helm_vars=""
if [[ -d "$HELM_CHARTS_DIR" ]]; then
    # Find templates directories in aztec-* charts only (excluding aztec-network)
    helm_vars=$(find "$HELM_CHARTS_DIR" -maxdepth 2 -type d -name templates -path "*/aztec-*/*" ! -path "*/aztec-network/*" | \
                xargs -I {} find {} -name "*.yaml" -o -name "*.yml" -o -name "*.tpl" 2>/dev/null | \
                xargs grep -hE "^\s*- name:\s+[A-Z][A-Z0-9_]*\s*$" 2>/dev/null | \
                sed -E 's/.*- name:\s+([A-Z][A-Z0-9_]*).*/\1/' | \
                sort -u || true)
fi

# Extract environment variables from Helm values files (node.env, validator.node.env, etc.)
echo "Scanning Helm values files..."
values_vars=""
if [[ -d "$HELM_CHARTS_DIR" ]]; then
    # Find values.yaml files in aztec-* chart directories only (excluding aztec-network)
    values_vars=$(find "$HELM_CHARTS_DIR" -maxdepth 2 -name "values.yaml" -path "*/aztec-*/*" ! -path "*/aztec-network/*" 2>/dev/null | \
                  xargs grep -hE "^\s+[A-Z][A-Z0-9_]*:" 2>/dev/null | \
                  sed -E 's/^\s+([A-Z][A-Z0-9_]*):.*/\1/' | \
                  sort -u || true)

    # Also scan terraform values files in deploy-aztec-infra
    if [[ -d "$TERRAFORM_DIR/deploy-aztec-infra/values" ]]; then
        terraform_values_vars=$(find "$TERRAFORM_DIR/deploy-aztec-infra/values" -name "*.yaml" 2>/dev/null | \
                                xargs grep -hE "^\s+[A-Z][A-Z0-9_]*:" 2>/dev/null | \
                                sed -E 's/^\s+([A-Z][A-Z0-9_]*):.*/\1/' | \
                                sort -u || true)
        values_vars=$(echo -e "$values_vars\n$terraform_values_vars" | grep -v "^$" | sort -u)
    fi
fi

# Extract environment variables from Terraform scripts
echo "Scanning Terraform scripts..."
terraform_vars=""
if [[ -d "$TERRAFORM_DIR/deploy-aztec-infra" ]]; then
    # Extract env vars set through Helm chart values like "node.env.VAR_NAME" or "validator.node.env.VAR_NAME"
    # Only these represent actual environment variables passed to the application
    terraform_vars=$(find "$TERRAFORM_DIR/deploy-aztec-infra" -name "*.tf" | \
                     xargs grep -hE '\.env\.[A-Z][A-Z0-9_]*"' 2>/dev/null | \
                     sed -E 's/.*\.env\.([A-Z][A-Z0-9_]*).*/\1/' | \
                     sort -u || true)
fi

# Combine and deduplicate all found variables
echo "Processing found variables..."
all_vars=$(echo -e "$helm_vars\n$values_vars\n$terraform_vars" | grep -v "^$" | sort -u)

# Extract defined variables from env_var.ts
echo "Extracting defined variables..."
if [[ ! -f "$ENV_VAR_FILE" ]]; then
    echo -e "${RED}Error: env_var.ts file not found: $ENV_VAR_FILE${NC}"
    exit 1
fi

defined_vars=$(grep -E "^\s*\|\s+'[A-Z][A-Z0-9_]*'" "$ENV_VAR_FILE" | \
               sed -E "s/.*'([A-Z][A-Z0-9_]*)'.*/\1/" | \
               sort)

# Check for missing variables (excluding known system/k8s vars)
echo "Checking for undefined variables..."
missing_vars=""
if [[ -n "$all_vars" ]]; then
    # Filter out excluded variables and check against defined vars
    filtered_vars=$(echo "$all_vars" | grep -vE "^($EXCLUDED_VARS)$" || true)

    if [[ -n "$filtered_vars" ]]; then
        missing_vars=$(comm -23 <(echo "$filtered_vars") <(echo "$defined_vars"))
    fi
fi

# Report results
echo
echo "=== RESULTS ==="
found_count=$(echo "$all_vars" | wc -l)
defined_count=$(echo "$defined_vars" | wc -l)

echo "Found $found_count unique environment variables in Helm templates and Terraform scripts"
echo "Found $defined_count defined environment variables in env_var.ts"

if [[ -z "$missing_vars" ]]; then
    echo -e "${GREEN}✅ All environment variables are properly defined!${NC}"
    exit_code=0
else
    missing_count=$(echo "$missing_vars" | wc -l)
    echo -e "${RED}❌ Found $missing_count undefined environment variables:${NC}"
    echo
    echo "$missing_vars" | while IFS= read -r var; do
        [[ -n "$var" ]] && echo -e "${RED}  - $var${NC}"
    done
    echo
    echo -e "${YELLOW}These variables should be added to yarn-project/foundation/src/config/env_var.ts${NC}"
    exit_code=1
fi

# Show debug info if verbose
if [[ "${VERBOSE:-}" == "1" ]]; then
    echo
    echo "=== DEBUG INFO ==="
    echo "All found variables:"
    echo "$all_vars"
fi

exit $exit_code
