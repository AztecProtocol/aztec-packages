#!/bin/bash
set -euo pipefail

# Deploy a new Rollup version using the CLI deploy-new-rollup command.
#
# Handles network detection, config loading, and credential management,
# then delegates to the CLI for genesis computation and contract deployment.
#
# Usage:
#   ./deploy_rollup_upgrade.sh <registry_address>
#
# Required environment variables:
#   L1_CHAIN_ID    - L1 chain ID (1=mainnet, 11155111=sepolia, 1337/31337=local)
#
# For production networks (mainnet/sepolia):
#   NETWORK        - Aztec network (mainnet, testnet, devnet)
#   GCP_PROJECT_ID - GCP project ID for Secret Manager
#
# For local/test environments (chain ID 1337):
#   L1_RPC_URL              - L1 RPC endpoint (required)
#   FUNDING_PRIVATE_KEY     - Used as deployment private key
#   AZTEC_* env vars        - Contract configuration (from .env file)

repo_root="$(git rev-parse --show-toplevel)"
source "${repo_root}/ci3/source"

log() { echo "[INFO]  $(date -Is) - $*"; }
die() { echo "[ERROR] $(date -Is) - $*" >&2; exit 1; }

registry_address="${1:?Usage: $0 <registry_address>}"

# Determine L1 chain ID - either from env or from network config
if [[ -z "${L1_CHAIN_ID:-}" ]]; then
  : "${NETWORK:?L1_CHAIN_ID or NETWORK is required}"
  network_defaults="${repo_root}/spartan/environments/network-defaults.yml"
  L1_CHAIN_ID=$(yq "explode(.) | .networks.$NETWORK.L1_CHAIN_ID" "$network_defaults")
fi

log "Starting rollup upgrade deployment"
log "L1 Chain ID: $L1_CHAIN_ID"
log "Registry: $registry_address"

# Determine L1 network type and load configuration
case "$L1_CHAIN_ID" in
  1)
    L1_NETWORK="mainnet"
    : "${NETWORK:?NETWORK is required for mainnet}"
    : "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required for mainnet}"
    ;;
  11155111)
    L1_NETWORK="sepolia"
    : "${NETWORK:?NETWORK is required for sepolia}"
    : "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required for sepolia}"
    ;;
  1337|31337)
    L1_NETWORK="local"
    : "${L1_RPC_URL:?L1_RPC_URL is required for local environments}"
    : "${FUNDING_PRIVATE_KEY:?FUNDING_PRIVATE_KEY is required for local environments}"
    ;;
  *)
    die "Unknown L1_CHAIN_ID '$L1_CHAIN_ID'. Supported: 1 (mainnet), 11155111 (sepolia), 1337/31337 (local)"
    ;;
esac
log "L1 Network: $L1_NETWORK"

# Load network defaults
if [[ -n "${NETWORK:-}" ]]; then
  log "Loading L1 contract defaults from network-defaults.yml for $NETWORK"
  source "${repo_root}/l1-contracts/scripts/load_network_defaults.sh" "$NETWORK"
else
  # No NETWORK specified - load base l1-contracts defaults, env vars will override
  log "Loading base l1-contracts defaults (env vars will override)"
  network_defaults="${repo_root}/spartan/environments/network-defaults.yml"
  while IFS='=' read -r key value; do
    # Only set if not already defined in environment
    if [[ -z "${!key:-}" ]]; then
      export "$key"="$value"
    fi
  done < <(yq -o=props '.l1-contracts' "$network_defaults" \
    | grep -v '^#' \
    | grep -v '^$' \
    | sed 's/ = /=/')
fi

# Configure L1 credentials
if [[ "$L1_NETWORK" == "local" ]]; then
  # Local/test environment - use provided env vars
  export PRIVATE_KEY="$FUNDING_PRIVATE_KEY"
  log "Using FUNDING_PRIVATE_KEY for deployment"
else
  # Production network - fetch secrets from GCP
  log "Fetching secrets from GCP..."
  get_secret() { gcloud secrets versions access latest --secret="$1" --project="$GCP_PROJECT_ID"; }
  export L1_RPC_URL=$(get_secret "${L1_NETWORK}-rpc-urls" | jq -r '.[0]')
  export PRIVATE_KEY=$(get_secret "${L1_NETWORK}-labs-rollup-private-key")
  export ETHERSCAN_API_KEY=$(get_secret "etherscan-api-key")
  log "Secrets loaded"
fi

# Map env vars for the CLI
export ETHEREUM_HOSTS="$L1_RPC_URL"

# Build CLI args
cli_args=(
  deploy-new-rollup
  --registry-address "$registry_address"
  --l1-chain-id "$L1_CHAIN_ID"
  --json
)

# Sponsored FPC and test accounts (CLI reads these from env as well)
if [[ "${SPONSORED_FPC:-true}" == "true" ]]; then
  cli_args+=(--sponsored-fpc)
fi
if [[ "${TEST_ACCOUNTS:-false}" == "true" ]]; then
  cli_args+=(--test-accounts)
fi
if [[ "${REAL_VERIFIER:-true}" == "true" ]]; then
  cli_args+=(--real-verifier)
fi
if [[ -n "${ETHERSCAN_API_KEY:-}" ]]; then
  cli_args+=(--etherscan-verify)
fi

log "Deploying rollup via CLI: ${cli_args[*]}"
exec node --no-warnings "$repo_root/yarn-project/aztec/dest/bin/index.js" "${cli_args[@]}"
