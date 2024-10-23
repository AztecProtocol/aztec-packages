#!/bin/bash
# NOTE! currently does not work with 'cannot validate constraint' on tx simulate via pxe
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

# Fetch the service URLs based on the namespace
export BOOTNODE_URL=http://$(kubectl get svc -n $NAMESPACE -o jsonpath="{.items[?(@.metadata.name=='$NAMESPACE-aztec-network-boot-node-lb-tcp')].status.loadBalancer.ingress[0].hostname}"):8080
export PXE_URL=http://$(kubectl get svc -n $NAMESPACE -o jsonpath="{.items[?(@.metadata.name=='$NAMESPACE-aztec-network-pxe-lb')].status.loadBalancer.ingress[0].hostname}"):8080
export ETHEREUM_HOST=http://$(kubectl get svc -n $NAMESPACE -o jsonpath="{.items[?(@.metadata.name=='$NAMESPACE-aztec-network-ethereum-lb')].status.loadBalancer.ingress[0].hostname}"):8545

# Validate that the URLs were fetched correctly
if [ -z "$BOOTNODE_URL" ] || [ -z "$PXE_URL" ] || [ -z "$ETHEREUM_HOST" ]; then
  echo "Error: Failed to retrieve one or more URLs from Kubernetes services."
  exit 1
fi

echo "BOOTNODE_URL: $BOOTNODE_URL"
echo "PXE_URL: $PXE_URL"
echo "ETHEREUM_HOST: $ETHEREUM_HOST"

# hack to ensure L2 contracts are considered deployed
touch $SCRIPT_DIR/../../yarn-project/end-to-end/scripts/native-network/state/l2-contracts.env
bash -x $SCRIPT_DIR/../../yarn-project/end-to-end/scripts/native-network/test-transfer.sh