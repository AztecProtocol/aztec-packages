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
kubectl delete podchaos,networkchaos,stresschaos,iochaos,timechaos,kernelchaos,dnschaos,httpchaos,blockchaos,jvmchaos,physicalmachinechaos \
  --namespace "$NAMESPACE" \
  --all \
  --ignore-not-found \
  2>/dev/null || true

# Delete the namespace
echo "Deleting namespace $NAMESPACE..."
kubectl delete namespace "$NAMESPACE"

echo "Destroyed network $NAMESPACE"
