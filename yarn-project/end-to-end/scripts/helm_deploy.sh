#!/bin/bash

# Usage: ./helm_deploy.sh
# Required environment variables:
#   NAMESPACE
# Optional environment variables:
#   VALUES_FILE (default: "default.yaml")
#   CHAOS_VALUES (default: "")
#   FRESH_INSTALL (default: "false")
#   AZTEC_DOCKER_TAG (default: current git commit)

set -eux

# Default values for environment variables
VALUES_FILE="${VALUES_FILE:-default.yaml}"
CHAOS_VALUES="${CHAOS_VALUES:-}"
FRESH_INSTALL="${FRESH_INSTALL:-false}"
AZTEC_DOCKER_TAG=${AZTEC_DOCKER_TAG:-$(git rev-parse HEAD)}

# Check required environment variable
if [ -z "${NAMESPACE:-}" ]; then
  echo "Environment variable NAMESPACE is required."
  exit 1
fi

if ! docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -q "aztecprotocol/aztec:$AZTEC_DOCKER_TAG"; then
  echo "Aztec docker image not found. It needs to be built with 'earthly ./yarn-project/+export-aztec' or otherwise an image named aztecprotocol/aztec:$AZTEC_DOCKER_TAG needs to exist, or AZTEC_DOCKER_TAG passed with a tag that exists."
  exit 1
fi

# Load the Docker images into kind
kind load docker-image aztecprotocol/aztec:$AZTEC_DOCKER_TAG

# If FRESH_INSTALL is true, delete the namespace
if [ "$FRESH_INSTALL" = "true" ]; then
  kubectl delete namespace "$NAMESPACE" --ignore-not-found=true --wait=true --now --timeout=10m
fi

function show_status_until_pxe_ready() {
  set +x # don't spam with our commands
  sleep 15 # let helm upgrade start
  for i in {1..200} ; do
    if kubectl wait pod -l app==pxe --for=condition=Ready -n "$NAMESPACE" --timeout=20s >/dev/null 2>/dev/null ; then
      break # we are up, stop showing status
    fi
    # show startup status
    kubectl get pods -n "$NAMESPACE"
  done
}

show_status_until_pxe_ready &

# Install the Helm chart
helm upgrade --install spartan "$(git rev-parse --show-toplevel)/spartan/aztec-network/" \
      --namespace "$NAMESPACE" \
      --create-namespace \
      --values "$(git rev-parse --show-toplevel)/spartan/aztec-network/values/$VALUES_FILE" \
      --set images.aztec.image="aztecprotocol/aztec:$AZTEC_DOCKER_TAG" \
      --wait \
      --wait-for-jobs=true \
      --timeout=30m

kubectl wait pod -l app==pxe --for=condition=Ready -n "$NAMESPACE" --timeout=10m