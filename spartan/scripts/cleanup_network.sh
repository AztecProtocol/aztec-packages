#!/usr/bin/env bash
# Cleanup script for network scenario namespaces
# Usage: ./cleanup_network.sh <namespace>
# This script deletes the Kubernetes namespace and waits for completion

set -euo pipefail

namespace="${1:-}"

if [ -z "$namespace" ]; then
  echo "Error: Namespace not provided"
  echo "Usage: $0 <namespace>"
  exit 1
fi

echo "=== Cleaning up network namespace: $namespace ==="

# Check if namespace exists
if ! kubectl get namespace "$namespace" >/dev/null 2>&1; then
  echo "Namespace $namespace does not exist, nothing to clean up"
  exit 0
fi

# Delete the namespace
echo "Deleting namespace $namespace..."
kubectl delete namespace "$namespace" --ignore-not-found=true --timeout=10m

# Wait for namespace deletion to complete
echo "Waiting for namespace deletion to complete..."
if kubectl wait --for=delete namespace/"$namespace" --timeout=15m 2>/dev/null; then
  echo "✓ Namespace $namespace successfully deleted"
  exit 0
else
  # If wait times out, check if namespace still exists
  if kubectl get namespace "$namespace" >/dev/null 2>&1; then
    echo "⚠ Warning: Namespace deletion timed out, namespace may still exist"
    echo "You may need to manually delete it with: kubectl delete namespace $namespace --force --grace-period=0"
    exit 1
  else
    echo "✓ Namespace $namespace successfully deleted"
    exit 0
  fi
fi
