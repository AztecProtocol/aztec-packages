#!/bin/bash
set -euo pipefail

# Deploy a new Rollup version and create a RegisterNewRollupVersionPayload for governance.
#
# Loads L1 contract defaults from network-defaults.yml (with YAML anchor inheritance),
# infers L1 chain from L1_CHAIN_ID, fetches GCP secrets, builds yarn-project for
# genesis values, then calls l1-contracts/scripts/run_rollup_upgrade.sh.
#
# Usage:
#   ./deploy_rollup_upgrade.sh <registry_address>
#
# Required environment variables:
#   NETWORK        - Aztec network (mainnet, testnet, devnet)
#   GCP_PROJECT_ID - GCP project ID for Secret Manager

repo_root="$(git rev-parse --show-toplevel)"
source "${repo_root}/ci3/source"

log() { echo "[INFO]  $(date -Is) - $*"; }
die() { echo "[ERROR] $(date -Is) - $*" >&2; exit 1; }

registry_address="${1:?Usage: $0 <registry_address>}"

: "${NETWORK:?NETWORK is required (mainnet, testnet, devnet)}"
: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"

log "Starting rollup upgrade deployment"
log "Network: $NETWORK"
log "Registry: $registry_address"

# Load network-specific defaults
log "Loading L1 contract defaults from network-defaults.yml"
source "${repo_root}/l1-contracts/scripts/load_network_defaults.sh" "$NETWORK"

# Infer L1 chain from L1_CHAIN_ID
network_defaults="${repo_root}/spartan/environments/network-defaults.yml"
l1_chain_id=$(yq "explode(.) | .networks.$NETWORK.L1_CHAIN_ID" "$network_defaults")
case "$l1_chain_id" in
  1) L1_NETWORK="mainnet" ;;
  11155111) L1_NETWORK="sepolia" ;;
  *) die "Unknown L1_CHAIN_ID '$l1_chain_id' for network '$NETWORK'" ;;
esac
log "L1 Chain: $L1_NETWORK (chain ID: $l1_chain_id)"

# Fetch secrets from GCP
log "Fetching secrets from GCP..."
get_secret() { gcloud secrets versions access latest --secret="$1" --project="$GCP_PROJECT_ID"; }
export L1_RPC_URL=$(get_secret "${L1_NETWORK}-rpc-urls" | jq -r '.[0]')
export ROLLUP_DEPLOYMENT_PRIVATE_KEY=$(get_secret "${L1_NETWORK}-labs-rollup-private-key")
export ETHERSCAN_API_KEY=$(get_secret "etherscan-api-key")
log "Secrets loaded"

# Build yarn-project for genesis values
cd "$repo_root"
log "Building yarn-project..."
BOOTSTRAP_TO=yarn-project ./bootstrap.sh

# Extract genesis values
cd yarn-project
export VK_TREE_ROOT=$(node -e "import('@aztec/noir-protocol-circuits-types/vk-tree').then(m => console.log(m.getVKTreeRoot().toString()))")
export PROTOCOL_CONTRACTS_HASH=$(node -e "import('@aztec/protocol-contracts').then(m => console.log(m.protocolContractsHash.toString()))")
export GENESIS_ARCHIVE_ROOT=$(node -e "import('@aztec/constants').then(m => console.log('0x' + m.GENESIS_ARCHIVE_ROOT.toString(16).padStart(64, '0')))")
cd ..

log "VK_TREE_ROOT: $VK_TREE_ROOT"
log "PROTOCOL_CONTRACTS_HASH: $PROTOCOL_CONTRACTS_HASH"
log "GENESIS_ARCHIVE_ROOT: $GENESIS_ARCHIVE_ROOT"

exec l1-contracts/scripts/run_rollup_upgrade.sh "$registry_address"
