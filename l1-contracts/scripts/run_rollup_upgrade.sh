#!/usr/bin/env bash
set -euo pipefail

# Deploy a rollup upgrade to an existing registry.
#
# Usage:
#   ./run_rollup_upgrade.sh <registry_address>
#
# Required environment variables:
#   L1_RPC_URL                    - RPC URL for the target network
#   ROLLUP_DEPLOYMENT_PRIVATE_KEY - Private key for the deployer account
#   AZTEC_* / ETHEREUM_*          - Contract configuration (from network-defaults.yml)
#   VK_TREE_ROOT, PROTOCOL_CONTRACTS_HASH, GENESIS_ARCHIVE_ROOT - Genesis values

cd "$(dirname "$0")/.."

# Batch size of 8 prevents forge from hanging during broadcast (forge bug with large RPC batches).
MAGIC_BATCH_SIZE=8
# Timeout ensures forge fails instead of hanging forever. Default 300s for mainnet/sepolia deployments.
FORGE_BROADCAST_TIMEOUT="${FORGE_BROADCAST_TIMEOUT:-300}"

registry_address="${1:?registry_address is required}"

echo "=== Deploying rollup upgrade ==="
echo "Registry: $registry_address"

REGISTRY_ADDRESS="$registry_address" \
REAL_VERIFIER="${REAL_VERIFIER:-true}" \
forge script script/deploy/DeployRollupForUpgrade.s.sol:DeployRollupForUpgrade \
  --rpc-url "$L1_RPC_URL" \
  --private-key "$ROLLUP_DEPLOYMENT_PRIVATE_KEY" \
  --broadcast \
  --batch-size "$MAGIC_BATCH_SIZE" \
  --timeout "$FORGE_BROADCAST_TIMEOUT" \
  ${ETHERSCAN_API_KEY:+--verify} \
  -vvv
