#!/usr/bin/env bash
# Tears down a KIND network deployment and cleans up local terraform state.
# Usage: ./kind_teardown.sh [namespace]
#   namespace: The Kubernetes namespace to delete (default: kind)

set -euo pipefail

NAMESPACE="${1:-kind}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPARTAN_DIR="$(dirname "$SCRIPT_DIR")"

echo "Tearing down KIND network in namespace: $NAMESPACE"

# Delete the Kubernetes namespace if it exists
if kubectl get namespace "$NAMESPACE" &>/dev/null; then
  echo "Deleting namespace $NAMESPACE..."
  kubectl delete namespace "$NAMESPACE" --ignore-not-found --timeout=120s
else
  echo "Namespace $NAMESPACE does not exist, skipping..."
fi

# Clean up terraform state directories for this namespace
# State is stored at: terraform/deploy-*/state/kind/<namespace>/
echo "Cleaning up terraform state for namespace: $NAMESPACE"
for tf_dir in "$SPARTAN_DIR"/terraform/deploy-*/state/kind; do
  if [[ -d "$tf_dir/$NAMESPACE" ]]; then
    echo "  Removing $tf_dir/$NAMESPACE"
    rm -rf "$tf_dir/$NAMESPACE"
  fi
done

# Also clean up the tfplan files that might have stale state
for tf_dir in "$SPARTAN_DIR"/terraform/deploy-*; do
  rm -rf "$tf_dir/tfplan" "$tf_dir/terraform.tfstate" "$tf_dir/state"
done

echo "KIND network teardown complete for namespace: $NAMESPACE"
