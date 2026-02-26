#!/usr/bin/env bash
set -euo pipefail

# Deploy the static mainnet alpha rollup + AlphaPayload bundle.
#
# Required environment variables:
#   L1_RPC_URL
#   ROLLUP_DEPLOYMENT_PRIVATE_KEY
#   DEPLOYER
#   ETHERSCAN_API_KEY

cd "$(dirname "$0")/.."

: "${L1_RPC_URL:?L1_RPC_URL is required}"
: "${ROLLUP_DEPLOYMENT_PRIVATE_KEY:?ROLLUP_DEPLOYMENT_PRIVATE_KEY is required}"
: "${DEPLOYER:?DEPLOYER is required}"
: "${ETHERSCAN_API_KEY:?ETHERSCAN_API_KEY is required for source verification}"

echo "=== Deploying static mainnet alpha rollup + payload ==="

forge script DeployAlpha \
  --rpc-url "$L1_RPC_URL" \
  --private-key "$ROLLUP_DEPLOYMENT_PRIVATE_KEY" \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --verify \
  --broadcast \
  --slow \
  -vvv
