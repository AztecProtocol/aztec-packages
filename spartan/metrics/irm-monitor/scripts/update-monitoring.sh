#!/bin/bash

set -e

# Script to deploy/update the irm-monitor with new rollup contract address
# Usage: ./update-monitoring.sh <network-namespace> <monitoring-namespace>

NAMESPACE=${1:-"testnet"}
MONITORING_NAMESPACE=${2:-"$NAMESPACE-irm"}
NETWORK=${3:-"$NAMESPACE"}
INFURA_URL_SECRET=${4:-"infura-sepolia-url"}

# Deployment name includes the monitoring namespace prefix
export DEPLOYMENT_NAME="${MONITORING_NAMESPACE}-monitor"

# Docker image (can be overridden via IMAGE_TAG or IMAGE environment variable)
IMAGE_TAG=${IMAGE_TAG:-latest}
IMAGE=${IMAGE:-"spypsy/block-height-monitor:${IMAGE_TAG}"}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$SCRIPT_DIR/.."

echo "Updating monitoring app for namespace: $NAMESPACE, monitoring ns: $MONITORING_NAMESPACE, deployment: $DEPLOYMENT_NAME"
echo "Using image: $IMAGE"

# Wait briefly for the network to settle
echo "Waiting for network deployment to be ready..."
# sleep 30

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

# Wait for port-forward to be ready with retries
echo "Waiting for port-forward to be ready..."
MAX_RETRIES=10
RETRY_COUNT=0
until curl -s http://localhost:8080 >/dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "Error: Port-forward to RPC node failed after $MAX_RETRIES attempts"
    kill $PF_PID 2>/dev/null || true
    exit 1
  fi
  echo "Waiting for port-forward... (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

# Get rollup contract address from rpc node
echo "Retrieving rollup contract address..."

L1_CONTRACTS=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getL1ContractAddresses","params":[],"id":1}' \
  "http://localhost:8080" 2>&1)

if [ $? -ne 0 ]; then
  echo "Error: curl command failed"
  echo "Response: $L1_CONTRACTS"
  kill $PF_PID 2>/dev/null || true
  exit 1
fi

ROLLUP_CONTRACT_ADDRESS=$(echo "$L1_CONTRACTS" | jq -r '.result.rollupAddress' 2>/dev/null)

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
CURRENT_CONTRACT_ADDRESS=$(kubectl -n "$MONITORING_NAMESPACE" get deploy "$DEPLOYMENT_NAME" -o jsonpath='{.spec.template.spec.containers[?(@.name=="aztec-chain-monitor")].env[?(@.name=="ROLLUP_CONTRACT_ADDRESS")].value}' 2>/dev/null || true)
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

# If deployment exists, just update it; no need for separate kubectl set env
if kubectl -n "$MONITORING_NAMESPACE" get deploy "$DEPLOYMENT_NAME" >/dev/null 2>&1; then
  echo "Deployment exists in $MONITORING_NAMESPACE. Updating ROLLUP_CONTRACT_ADDRESS and NETWORK..."
  yq eval ".metadata.name = \"${DEPLOYMENT_NAME}\" |
           .metadata.labels.app = \"${DEPLOYMENT_NAME}\" |
           .spec.selector.matchLabels.app = \"${DEPLOYMENT_NAME}\" |
           .spec.template.metadata.labels.app = \"${DEPLOYMENT_NAME}\" |
           (.spec.template.spec.containers[] | select(.name == \"aztec-chain-monitor\") | .image) = \"${IMAGE}\" |
           (.spec.template.spec.containers[] | select(.name == \"aztec-chain-monitor\") | .env[] | select(.name == \"ROLLUP_CONTRACT_ADDRESS\") | .value) = \"${ROLLUP_CONTRACT_ADDRESS}\" |
           (.spec.template.spec.containers[] | select(.name == \"aztec-chain-monitor\") | .env[] | select(.name == \"NETWORK\") | .value) = \"${NETWORK}\"" \
      "$BASE_DIR/kubernetes/monitoring-deployment.yaml" | kubectl -n "$MONITORING_NAMESPACE" apply -f -
  kubectl -n "$MONITORING_NAMESPACE" annotate deployment/"$DEPLOYMENT_NAME" rollup.aztec.dev/address="$ROLLUP_CONTRACT_ADDRESS" --overwrite
  echo "Waiting for rollout..."
  kubectl -n "$MONITORING_NAMESPACE" rollout status deployment/"$DEPLOYMENT_NAME" --timeout=300s
  echo "Update complete."
  exit 0
fi

# Fetch GCP secrets
echo "Fetching GCP secrets..."
INFURA_URL=$(gcloud secrets versions access latest --secret=$INFURA_URL_SECRET)
GRAFANA_PASSWORD=$(gcloud secrets versions access latest --secret=grafana-cloud-password)

# Ensure monitoring namespace exists
kubectl get ns "$MONITORING_NAMESPACE" >/dev/null 2>&1 || kubectl create ns "$MONITORING_NAMESPACE"

# Create/update secrets
echo "Applying monitoring secrets..."
kubectl -n "$MONITORING_NAMESPACE" create secret generic irm-monitor-secrets \
  --from-literal=infura-sepolia-url="$INFURA_URL" \
  --from-literal=grafana-cloud-password="$GRAFANA_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

# Apply manifests (namespace-agnostic)
echo "Applying Grafana Alloy ConfigMap..."
kubectl -n "$MONITORING_NAMESPACE" apply -f "$BASE_DIR/kubernetes/grafana-alloy-configmap.yaml"

echo "Applying Service..."
yq eval ".metadata.name = \"${DEPLOYMENT_NAME}\" |
         .metadata.labels.app = \"${DEPLOYMENT_NAME}\" |
         .spec.selector.app = \"${DEPLOYMENT_NAME}\"" \
    "$BASE_DIR/kubernetes/monitoring-service.yaml" | kubectl -n "$MONITORING_NAMESPACE" apply -f -

# Build image if missing (initial install path only)
SCRIPT_BUILD="$SCRIPT_DIR/build-and-publish.sh"
if [ -x "$SCRIPT_BUILD" ]; then
  echo "Ensuring image spypsy/block-height-monitor:${IMAGE_TAG} exists..."
  "$SCRIPT_BUILD" "$IMAGE_TAG"
fi

echo "Applying Deployment..."
yq eval ".metadata.name = \"${DEPLOYMENT_NAME}\" |
         .metadata.labels.app = \"${DEPLOYMENT_NAME}\" |
         .spec.selector.matchLabels.app = \"${DEPLOYMENT_NAME}\" |
         .spec.template.metadata.labels.app = \"${DEPLOYMENT_NAME}\" |
         (.spec.template.spec.containers[] | select(.name == \"aztec-chain-monitor\") | .image) = \"${IMAGE}\" |
         (.spec.template.spec.containers[] | select(.name == \"aztec-chain-monitor\") | .env[] | select(.name == \"ROLLUP_CONTRACT_ADDRESS\") | .value) = \"${ROLLUP_CONTRACT_ADDRESS}\" |
         (.spec.template.spec.containers[] | select(.name == \"aztec-chain-monitor\") | .env[] | select(.name == \"NETWORK\") | .value) = \"${NETWORK}\"" \
    "$BASE_DIR/kubernetes/monitoring-deployment.yaml" | kubectl -n "$MONITORING_NAMESPACE" apply -f -

# Show deployed values
echo "Deployment contract address: $ROLLUP_CONTRACT_ADDRESS"
echo "Network: $NETWORK"
echo "Image: $IMAGE"

echo "Waiting for rollout..."
kubectl -n "$MONITORING_NAMESPACE" rollout status deployment/"$DEPLOYMENT_NAME" --timeout=300s

echo "Monitoring app applied successfully!"
