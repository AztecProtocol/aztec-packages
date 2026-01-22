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
#
# Optional environment variables:
#   MAX_RETRIES                   - Number of retry attempts (default: 5)
#   RETRY_DELAY_SECONDS           - Delay between retries (default: 30)

cd "$(dirname "$0")/.."

registry_address="${1:?registry_address is required}"
max_retries="${MAX_RETRIES:-5}"
retry_delay="${RETRY_DELAY_SECONDS:-30}"

echo "=== Deploying rollup upgrade ==="
echo "Registry: $registry_address"

# Retry loop to handle transient gas price issues
for attempt in $(seq 1 "$max_retries"); do
  echo "Deployment attempt $attempt of $max_retries..."

  if REGISTRY_ADDRESS="$registry_address" \
     REAL_VERIFIER="${REAL_VERIFIER:-true}" \
     forge script script/deploy/DeployRollupForUpgrade.s.sol:DeployRollupForUpgrade \
       --rpc-url "$L1_RPC_URL" \
       --private-key "$ROLLUP_DEPLOYMENT_PRIVATE_KEY" \
       --broadcast \
       ${ETHERSCAN_API_KEY:+--verify} \
       -vvv; then
    echo "Deployment succeeded on attempt $attempt"
    exit 0
  fi

  exit_code=$?
  echo "Deployment failed with exit code $exit_code"

  if [[ $attempt -lt $max_retries ]]; then
    echo "Waiting ${retry_delay}s before retry (gas price may decrease)..."
    sleep "$retry_delay"
  fi
done

echo "All $max_retries deployment attempts failed"
exit 1
