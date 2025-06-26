#!/bin/bash

set -e

# Script to update the alpha-testnet-monitor with new rollup contract address
# Usage: ./update-monitoring.sh <namespace> <release-name> <metrics-namespace>

NAMESPACE=${1:-"alpha-testnet"}
RELEASE_NAME=${2:-"alpha-testnet-monitor"}
MONITORING_NAMESPACE=${3:-"monitoring"}

echo "Updating monitoring app for namespace: $NAMESPACE, release: $RELEASE_NAME"

# Wait for network deployment to be ready
echo "Waiting for network deployment to be ready..."
sleep 60

# Get the boot node service name
BOOT_NODE_SERVICE="$RELEASE_NAME-boot-node"

# Wait for boot node to be ready
echo "Waiting for boot node to be ready..."
kubectl wait --for=condition=ready pod -l app=$BOOT_NODE_SERVICE -n $NAMESPACE --timeout=600s

# Get boot node port-forward
echo "Setting up port-forward to boot node..."
kubectl port-forward -n $NAMESPACE svc/$BOOT_NODE_SERVICE 8080:8080 &
PF_PID=$!

# Wait for port-forward to be ready
sleep 10

# Get rollup contract address from boot node
echo "Retrieving rollup contract address..."
L1_CONTRACTS=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getL1ContractAddresses","params":[],"id":1}' \
  "http://localhost:8080")

ROLLUP_CONTRACT_ADDRESS=$(echo $L1_CONTRACTS | jq -r '.result.rollupAddress')

if [ -z "$ROLLUP_CONTRACT_ADDRESS" ] || [ "$ROLLUP_CONTRACT_ADDRESS" = "null" ]; then
  echo "Error: Could not retrieve rollup contract address!"
  echo "L1 contracts response: $L1_CONTRACTS"
  kill $PF_PID
  exit 1
fi

echo "New rollup contract address: $ROLLUP_CONTRACT_ADDRESS"

# Kill port-forward
kill $PF_PID

# Check if monitoring app exists and get current contract address
echo "Checking current monitoring app configuration..."
if helm list -n $MONITORING_NAMESPACE | grep -q "alpha-testnet-monitor"; then
  CURRENT_CONTRACT_ADDRESS=$(helm get values alpha-testnet-monitor -n $MONITORING_NAMESPACE -o json | jq -r '.env.ROLLUP_CONTRACT_ADDRESS // empty')
  echo "Current contract address in monitoring: $CURRENT_CONTRACT_ADDRESS"

  if [ "$CURRENT_CONTRACT_ADDRESS" = "$ROLLUP_CONTRACT_ADDRESS" ]; then
    echo "Contract address unchanged. Skipping monitoring app update."
    exit 0
  else
    echo "Contract address changed from $CURRENT_CONTRACT_ADDRESS to $ROLLUP_CONTRACT_ADDRESS. Updating monitoring app..."
  fi
else
  echo "Monitoring app not found. Deploying new monitoring app..."
fi

# Fetch GCP secrets
echo "Fetching GCP secrets..."
INFURA_URL=$(gcloud secrets versions access latest --secret=infura-sepolia-url)
GRAFANA_PASSWORD=$(gcloud secrets versions access latest --secret=grafana-cloud-password)

# Get the script directory to find the helm chart
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELM_CHART_DIR="$SCRIPT_DIR/../helm"

# Deploy/update the monitoring app
echo "Deploying/updating monitoring app..."
helm upgrade --install alpha-testnet-monitor $HELM_CHART_DIR \
  --namespace $MONITORING_NAMESPACE \
  --create-namespace \
  --set env.ROLLUP_CONTRACT_ADDRESS="$ROLLUP_CONTRACT_ADDRESS" \
  --set secrets.infuraSepoliaUrl="$INFURA_URL" \
  --set secrets.grafanaCloudPassword="$GRAFANA_PASSWORD" \
  --wait --timeout=300s

echo "Monitoring app deployed successfully!"
