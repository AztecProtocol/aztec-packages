#!/bin/bash
# Targets a running cluster and deploys example contracts for testing
set -eu
set -o pipefail

echo "Bootstrapping network with test contracts"

NAMESPACE=${1:-spartan}
TAG=${2:-latest}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$NAMESPACE" ]; then
  echo "Usage: $0 (optional: <namespace>)"
  echo "Example: $0 devnet"
  exit 1
fi

# Helper function to get load balancer URL based on namespace and service name
function get_load_balancer_url() {
  local namespace=$1
  local service_name=$2
  kubectl get svc -n $namespace -o jsonpath="{.items[?(@.metadata.name=='$service_name')].status.loadBalancer.ingress[0].hostname}"
}

# Fetch the service URLs based on the namespace for injection in the test-transfer.sh
export BOOTNODE_URL=http://$(get_load_balancer_url $NAMESPACE "$NAMESPACE-aztec-network-boot-node-lb-tcp"):8080
export PXE_URL=http://$(get_load_balancer_url $NAMESPACE "$NAMESPACE-aztec-network-pxe-lb"):8080
export ETHEREUM_HOST=http://$(get_load_balancer_url $NAMESPACE "$NAMESPACE-aztec-network-ethereum-lb"):8545

echo "BOOTNODE_URL: $BOOTNODE_URL"
echo "PXE_URL: $PXE_URL"
echo "ETHEREUM_HOST: $ETHEREUM_HOST"

echo "Bootstrapping contracts for test network. NOTE: This took one hour last run."
# hack to ensure L2 contracts are considered deployed
docker run aztecprotocol/aztec:$TAG bootstrap-network \
  --rpc-url $BOOTNODE_URL \
  --l1-rpc-url $ETHEREUM_HOST \
  --l1-chain-id 31337 \
  --l1-private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --json | tee ./basic_contracts.json
