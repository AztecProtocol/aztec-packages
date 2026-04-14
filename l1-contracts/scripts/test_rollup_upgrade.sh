#!/usr/bin/env bash
set -euo pipefail

# Test rollup upgrade deployment on local anvil with devnet defaults.

cd "$(dirname "$0")/.."

echo "=== Loading devnet defaults ==="
source ./scripts/load_network_defaults.sh devnet

cleanup() {
  if [[ -n "${anvil_pid:-}" ]]; then
    echo "Stopping anvil (PID: $anvil_pid)"
    kill "$anvil_pid" 2>/dev/null || true
    wait "$anvil_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Clean stale broadcast artifacts from previous runs to avoid nonce conflicts.
rm -rf broadcast/

# Fixed port — this test runs with ISOLATE=1 so no conflicts.
ANVIL_PORT="${ANVIL_PORT:-8545}"

echo "=== Starting anvil on port $ANVIL_PORT ==="
anvil --port "$ANVIL_PORT" &
anvil_pid=$!
sleep 2

export L1_RPC_URL="http://127.0.0.1:$ANVIL_PORT"
export ROLLUP_DEPLOYMENT_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

echo "=== Deploying initial L1 contracts ==="
./scripts/forge_broadcast.js \
  script/deploy/DeployAztecL1Contracts.s.sol:DeployAztecL1Contracts \
  --rpc-url "$L1_RPC_URL" \
  --private-key "$ROLLUP_DEPLOYMENT_PRIVATE_KEY" \
  --json > /tmp/initial_deploy.jsonl

deploy_json=$(head -1 /tmp/initial_deploy.jsonl | jq -r '.logs[0]' | sed 's/JSON DEPLOY RESULT: //')
echo ""
echo "=== Initial deployment result ==="
echo "$deploy_json" | jq .
echo ""

registry_address=$(echo "$deploy_json" | jq -r '.registryAddress')
if [[ -z "$registry_address" || "$registry_address" == "null" ]]; then
  echo "ERROR: Could not extract registry address from initial deployment"
  exit 1
fi

echo "=== Testing run_rollup_upgrade.sh ==="
# Use a different genesis to get a different rollup version
export GENESIS_ARCHIVE_ROOT="0x$(openssl rand -hex 32)"

./scripts/run_rollup_upgrade.sh "$registry_address"

echo ""
echo "=== Test completed successfully ==="
