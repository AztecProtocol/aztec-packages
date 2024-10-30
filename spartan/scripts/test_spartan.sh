#!/bin/bash
# Targets a running cluster and tests 5 slots worth of transfers against it.
set -eu
set -o pipefail

# Test a deployed cluster

NAMESPACE=${1:-spartan}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$NAMESPACE" ]; then
  echo "Usage: $0 (optional: <namespace>)"
  echo "Example: $0 devnet"
  exit 1
fi

echo "Note: Repo should be bootstrapped with ./bootstrap.sh fast."

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

# hack to ensure L2 contracts are considered deployed
touch $SCRIPT_DIR/../../yarn-project/end-to-end/scripts/native-network/state/l2-contracts.env
bash -x $SCRIPT_DIR/../../yarn-project/end-to-end/scripts/native-network/test-4epochs.sh
