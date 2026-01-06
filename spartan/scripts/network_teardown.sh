#!/usr/bin/env bash

set -euo pipefail

remove_finalizers() {
  local resource_type=$1
  local namespace=$2

  # sometimes Chaos mesh resources become stuck when deleting. The way to work around the issue is to remove any 'finalizers'
  kubectl get "$resource_type" -n "$namespace" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | tr ' ' '\n' | while read -r name; do
    if [ -n "$name" ]; then
      echo "Removing finalizers from $resource_type/$name..."
      kubectl patch "$resource_type" "$name" -n "$namespace" --type=merge -p '{"metadata":{"finalizers":[]}}' 2>/dev/null || true
    fi
  done
}

CHAOS_MESH_TYPES=(
  workflow.chaos-mesh.org
  workflownode.chaos-mesh.org
  podchaos.chaos-mesh.org
  networkchaos.chaos-mesh.org
  stresschaos.chaos-mesh.org
  iochaos.chaos-mesh.org
  timechaos.chaos-mesh.org
  kernelchaos.chaos-mesh.org
  dnschaos.chaos-mesh.org
  httpchaos.chaos-mesh.org
  blockchaos.chaos-mesh.org
  jvmchaos.chaos-mesh.org
  physicalmachinechaos.chaos-mesh.org
)

if [ -z "$NAMESPACE" ]; then
  echo "Missing NAMESPACE env var" >&2
  exit 1
fi

echo "Destroying network..."
spartan=$(git rev-parse --show-toplevel)/spartan
scripts_dir=$spartan/scripts

# Delete Chaos Mesh experiments if they exist
has_chaos_resources=false
for resource_type in "${CHAOS_MESH_TYPES[@]}"; do
  if kubectl get "$resource_type" -n "$NAMESPACE" --no-headers 2>/dev/null | grep -q .; then
    has_chaos_resources=true
    break
  fi
done

if [ "$has_chaos_resources" = true ]; then
  echo "Cleaning up Chaos Mesh experiments in namespace $NAMESPACE..."

  # Delete all chaos mesh resources
  for resource_type in "${CHAOS_MESH_TYPES[@]}"; do
    kubectl delete "$resource_type" \
      --namespace "$NAMESPACE" \
      --all \
      --ignore-not-found \
      --timeout 60s \
      2>/dev/null || true
  done

  echo "Waiting for Chaos Mesh resources to be deleted..."
  sleep 5

  echo "Removing finalizers from any stuck Chaos Mesh resources..."
  for resource_type in "${CHAOS_MESH_TYPES[@]}"; do
    remove_finalizers "$resource_type" "$NAMESPACE"
  done

  echo "Waiting for Chaos Mesh resources to be fully deleted..."
  for resource_type in "${CHAOS_MESH_TYPES[@]}"; do
    kubectl wait --for=delete "$resource_type" --all -n "$NAMESPACE" --timeout=30s 2>/dev/null || true
  done
fi

# Delete the namespace
echo "Deleting namespace $NAMESPACE..."
kubectl delete namespace "$NAMESPACE"

echo "Destroyed network $NAMESPACE"
