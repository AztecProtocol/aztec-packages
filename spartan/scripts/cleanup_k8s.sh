#!/usr/bin/env bash

# Helper script for deploying local KIND scenarios.
# Overrides refers to overriding values in the values yaml file
# Usage: ./cleanup_k8s.sh <namespace> [<instance>]
# Optional environment variables:
#   DELETE_NAMESPACE (default: "true", deletes the entire Kubernetes namespace)

source $(git rev-parse --show-toplevel)/ci3/source

set -x

namespace="$1"
helm_instance="${2:-spartan}"

if [ -z "$namespace" ]; then
  echo "Namespace not provided"
  exit 1
fi

if [ -z "$helm_instance" ]; then
  echo "Helm instalation not provided"
  exit 1
fi

helm uninstall "$helm_instance" \
    --namespace "$namespace" \
    --ignore-not-found \
    --cascade foreground \
    --timeout 5m \
    --wait

if [ "${DELETE_NAMESPACE:-true}" = "true" ]; then 
  kubectl delete namespace "$namespace" --ignore-not-found=true --wait=true --now --timeout=10m &>/dev/null || true
fi
