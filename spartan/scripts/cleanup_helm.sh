#!/bin/bash

# Script to manually clean up stuck Helm releases
# Usage: ./cleanup_helm.sh [release-name] [namespace]

RELEASE_NAME=${1:-"eth-devnet"}
NAMESPACE=${2:-"eth-devnet"}

echo "=== Cleaning up stuck Helm release: $RELEASE_NAME in namespace: $NAMESPACE ==="

# Check current state
echo "Current Helm releases:"
helm list -n $NAMESPACE -a

echo "Current Helm secrets:"
kubectl get secrets -n $NAMESPACE -l owner=helm

# Look for pending operations
echo "Checking for pending operations..."
kubectl get secrets -n $NAMESPACE -l owner=helm -o json | jq -r '.items[] | select(.metadata.labels.status == "pending-install" or .metadata.labels.status == "pending-upgrade" or .metadata.labels.status == "pending-rollback") | "\(.metadata.name) - \(.metadata.labels.status)"'

# Force cleanup
echo "Force deleting pending Helm secrets..."
kubectl delete secrets -n $NAMESPACE -l owner=helm,status=pending-install --ignore-not-found=true
kubectl delete secrets -n $NAMESPACE -l owner=helm,status=pending-upgrade --ignore-not-found=true
kubectl delete secrets -n $NAMESPACE -l owner=helm,status=pending-rollback --ignore-not-found=true

# Try to uninstall
echo "Attempting to uninstall release..."
helm uninstall $RELEASE_NAME -n $NAMESPACE --wait --timeout=60s || echo "Uninstall failed or no release found"

# Nuclear option: delete all Helm secrets for this release
echo "Force deleting all Helm secrets for release $RELEASE_NAME..."
kubectl delete secrets -n $NAMESPACE -l name=$RELEASE_NAME,owner=helm --ignore-not-found=true

# Clean up all resources in namespace
echo "Cleaning up all resources in namespace..."
kubectl delete all --all -n $NAMESPACE --ignore-not-found=true

echo "=== Cleanup complete! ==="
echo "You can now retry your deployment."
