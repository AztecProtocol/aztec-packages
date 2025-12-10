#!/bin/bash
set -e

cd /mnt/user-data/adam/sources/mainframehub/clones/pr-18622/l1-contracts

# Check that private key environment variable is set
if [ -z "$FOUNDRY_PRIVATE_KEY" ]; then
  echo "Error: FOUNDRY_PRIVATE_KEY environment variable is not set"
  echo "Please set it with: export FOUNDRY_PRIVATE_KEY=0x..."
  exit 1
fi

# Sepolia RPC URL - use env var if set, otherwise use public endpoint
SEPOLIA_RPC_URL="${ETH_RPC_URL:-https://sepolia.gateway.tenderly.co}"

echo "=== Deploying to Sepolia ==="
echo "Using RPC: $SEPOLIA_RPC_URL"

time forge script script/deploy/DeployAztecL1Contracts.s.sol \
  --sig 'run(string)' /mnt/user-data/adam/sources/mainframehub/clones/pr-18622/l1-contracts/.deployments/l1-contracts-deploy-YGQi6r/rollup-upgrade.json \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --private-key "$FOUNDRY_PRIVATE_KEY" \
  --broadcast \
  --batch-size 16 \
  -vvvv

echo "Done"
