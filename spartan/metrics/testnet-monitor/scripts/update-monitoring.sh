#!/bin/bash

set -e

# Script to deploy/update the testnet-monitor with new rollup contract address
# Usage: ./update-monitoring.sh <network-namespace> <monitoring-namespace>

NAMESPACE=${1:-"testnet"}
MONITORING_NAMESPACE=${2:-"$NAMESPACE-block-height-monitor"}
NETWORK=${3:-"$NAMESPACE"}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


echo "Updating monitoring app for namespace: $NAMESPACE, monitoring ns: $MONITORING_NAMESPACE"

# Wait briefly for the network to settle
echo "Waiting for network deployment to be ready..."
sleep 30

# RPC node resource names
RPC_NODE_PREFIX="${NAMESPACE}-rpc-aztec-node"

# Find the RPC pod (e.g., ${NAMESPACE}-rpc-aztec-node-0)
RPC_POD=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{.items[*].metadata.name}' | tr ' ' '\n' | grep "^${RPC_NODE_PREFIX}-" | head -n1 || true)

if [ -z "$RPC_POD" ]; then
  echo "Error: Could not find RPC pod with prefix ${RPC_NODE_PREFIX}- in namespace ${NAMESPACE}"
  kubectl get pods -n "$NAMESPACE"
  exit 1
fi

# Wait for rpc node pod to be ready
echo "Waiting for rpc node pod $RPC_POD to be ready..."
kubectl wait --for=condition=ready "pod/${RPC_POD}" -n "$NAMESPACE" --timeout=600s

# Port-forward to rpc node (prefer Service if it exists)
echo "Setting up port-forward to rpc node..."
if kubectl -n "$NAMESPACE" get svc "${RPC_NODE_PREFIX}" >/dev/null 2>&1; then
  kubectl port-forward -n "$NAMESPACE" "svc/${RPC_NODE_PREFIX}" 8080:8080 &
else
  kubectl port-forward -n "$NAMESPACE" "pod/${RPC_POD}" 8080:8080 &
fi
PF_PID=$!
trap 'kill $PF_PID >/dev/null 2>&1 || true' EXIT

# Wait for port-forward
sleep 10

# Get rollup contract address from rpc node
echo "Retrieving rollup contract address..."
L1_CONTRACTS=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getL1ContractAddresses","params":[],"id":1}' \
  "http://localhost:8080")

ROLLUP_CONTRACT_ADDRESS=$(echo "$L1_CONTRACTS" | jq -r '.result.rollupAddress')

if [ -z "$ROLLUP_CONTRACT_ADDRESS" ] || [ "$ROLLUP_CONTRACT_ADDRESS" = "null" ]; then
  echo "Error: Could not retrieve rollup contract address!"
  echo "L1 contracts response: $L1_CONTRACTS"
  exit 1
fi

echo "New rollup contract address: $ROLLUP_CONTRACT_ADDRESS"

# Stop port-forward
kill $PF_PID || true
trap - EXIT

# Check current deployment value BEFORE applying anything; skip if unchanged
CURRENT_CONTRACT_ADDRESS=$(kubectl -n "$MONITORING_NAMESPACE" get deploy testnet-monitor -o jsonpath='{.spec.template.spec.containers[?(@.name=="aztec-chain-monitor")].env[?(@.name=="ROLLUP_CONTRACT_ADDRESS")].value}' 2>/dev/null || true)
if [ -n "$CURRENT_CONTRACT_ADDRESS" ] && [ "$CURRENT_CONTRACT_ADDRESS" = "$ROLLUP_CONTRACT_ADDRESS" ]; then
  echo "ROLLUP_CONTRACT_ADDRESS unchanged ($CURRENT_CONTRACT_ADDRESS). Skipping apply."
  exit 0
fi

# Fetch Grafana stack token and create a 40-minute silence before making changes
echo "Fetching Grafana stack token from GCP Secrets..."
GRAFANA_TOKEN=$(gcloud secrets versions access latest --secret=grafana-stack-token)
SILENCE_SCRIPT="$SCRIPT_DIR/silence-alerts.sh"
echo "Creating Grafana silence (40 minutes)..."
NETWORK_LABEL="$NAMESPACE" GRAFANA_TOKEN="$GRAFANA_TOKEN" "$SILENCE_SCRIPT" 40

# If deployment exists, just update the env var and annotate; no re-apply of manifests
if kubectl -n "$MONITORING_NAMESPACE" get deploy testnet-monitor >/dev/null 2>&1; then
  echo "Deployment exists in $MONITORING_NAMESPACE. Updating only ROLLUP_CONTRACT_ADDRESS and annotation..."
  kubectl -n "$MONITORING_NAMESPACE" set env deployment/testnet-monitor ROLLUP_CONTRACT_ADDRESS="$ROLLUP_CONTRACT_ADDRESS" NETWORK="$NETWORK" --containers=aztec-chain-monitor
  kubectl -n "$MONITORING_NAMESPACE" annotate deployment/testnet-monitor rollup.aztec.dev/address="$ROLLUP_CONTRACT_ADDRESS" --overwrite
  echo "Waiting for rollout..."
  kubectl -n "$MONITORING_NAMESPACE" rollout status deployment/testnet-monitor --timeout=300s
  echo "Update complete."
  exit 0
fi

# Fetch GCP secrets
echo "Fetching GCP secrets..."
INFURA_URL=$(gcloud secrets versions access latest --secret=infura-sepolia-url)
GRAFANA_PASSWORD=$(gcloud secrets versions access latest --secret=grafana-cloud-password)

# Ensure monitoring namespace exists
kubectl get ns "$MONITORING_NAMESPACE" >/dev/null 2>&1 || kubectl create ns "$MONITORING_NAMESPACE"

# Create/update secrets
echo "Applying monitoring secrets..."
kubectl -n "$MONITORING_NAMESPACE" create secret generic testnet-monitor-secrets \
  --from-literal=infura-sepolia-url="$INFURA_URL" \
  --from-literal=grafana-cloud-password="$GRAFANA_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

# Apply manifests (namespace-agnostic)
BASE_DIR="$SCRIPT_DIR/.."

echo "Applying Grafana Agent ConfigMap..."
kubectl -n "$MONITORING_NAMESPACE" apply -f "$BASE_DIR/kubernetes/grafana-agent-configmap.yaml"

echo "Applying Service..."
kubectl -n "$MONITORING_NAMESPACE" apply -f "$BASE_DIR/kubernetes/monitoring-service.yaml"

# Build image if missing (initial install path only)
TAG=${IMAGE_TAG:-latest}
SCRIPT_BUILD="$SCRIPT_DIR/build-and-publish.sh"
if [ -x "$SCRIPT_BUILD" ]; then
  echo "Ensuring image aztecprotocol/aztec-block-height-monitor:${TAG} exists..."
  "$SCRIPT_BUILD" "$TAG"
fi

echo "Applying Deployment..."
kubectl -n "$MONITORING_NAMESPACE" apply -f "$BASE_DIR/kubernetes/monitoring-deployment.yaml"

# Set/Update the rollup contract address env var on the app container
echo "Setting ROLLUP_CONTRACT_ADDRESS on deployment..."
kubectl -n "$MONITORING_NAMESPACE" set env deployment/testnet-monitor ROLLUP_CONTRACT_ADDRESS="$ROLLUP_CONTRACT_ADDRESS" NETWORK="$NETWORK" --containers=aztec-chain-monitor

# Show change
CURRENT_CONTRACT_ADDRESS=$(kubectl -n "$MONITORING_NAMESPACE" get deploy testnet-monitor -o jsonpath='{.spec.template.spec.containers[?(@.name=="aztec-chain-monitor")].env[?(@.name=="ROLLUP_CONTRACT_ADDRESS")].value}' 2>/dev/null || true)
echo "Deployment contract address is now: $CURRENT_CONTRACT_ADDRESS"

echo "Waiting for rollout..."
kubectl -n "$MONITORING_NAMESPACE" rollout status deployment/testnet-monitor --timeout=300s

echo "Monitoring app applied successfully!"
