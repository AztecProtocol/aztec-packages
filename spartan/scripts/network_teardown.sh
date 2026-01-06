#!/usr/bin/env bash

set -euo pipefail

if [ -z "$NAMESPACE" ]; then
  echo "Missing NAMESPACE env var" >&2
  exit 1
fi

echo "Destroying network..."
spartan=$(git rev-parse --show-toplevel)/spartan
scripts_dir=$spartan/scripts

# Delete Chaos Mesh experiments if they exist
echo "Cleaning up Chaos Mesh experiments in namespace $NAMESPACE..."

# Split this into two different delete calls
kubectl delete workflow.chaos-mesh.org,workflownode.chaos-mesh.orgs \
  --namespace "$NAMESPACE" \
  --all \
  --ignore-not-found \
  --timeout 60s \
  2>/dev/null || true

kubectl delete podchaos.chaos-mesh.org,networkchaos.chaos-mesh.org,stresschaos.chaos-mesh.org,iochaos.chaos-mesh.org,timechaos.chaos-mesh.org,kernelchaos.chaos-mesh.org,dnschaos.chaos-mesh.org,httpchaos.chaos-mesh.org,blockchaos.chaos-mesh.org,jvmchaos.chaos-mesh.org,physicalmachinechaos.chaos-mesh.org \
  --namespace "$NAMESPACE" \
  --all \
  --ignore-not-found \
  --timeout 60s \
  2>/dev/null || true

# Delete the namespace
echo "Deleting namespace $NAMESPACE..."
kubectl delete namespace "$NAMESPACE"

echo "Destroyed network $NAMESPACE"
