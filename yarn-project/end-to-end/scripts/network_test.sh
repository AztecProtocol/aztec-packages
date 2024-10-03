#!/bin/bash

# Usage: ./network_test.sh <test>
# Required environment variables:
#   NAMESPACE
# Optional environment variables:
#   VALUES_FILE (default: "default.yaml")
#   CHAOS_VALUES (default: "")
#   FRESH_INSTALL (default: "false")
#   AZTEC_DOCKER_TAG (default: current git commit)

set -eux

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Main positional parameter
TEST="$1"

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

if ! docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -q "aztecprotocol/aztec:$AZTEC_DOCKER_TAG" || \
   ! docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -q "aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG"; then
  echo "Docker images not found. They need to be built with 'earthly ./yarn-project/+export-e2e-test-images' or otherwise tagged with aztecprotocol/aztec:$AZTEC_DOCKER_TAG and aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG."
  exit 1
fi

# Load the Docker images into kind
kind load docker-image aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG
kind load docker-image aztecprotocol/aztec:$AZTEC_DOCKER_TAG

# If FRESH_INSTALL is true, delete the namespace
if [ "$FRESH_INSTALL" = "true" ]; then
  kubectl delete namespace "$NAMESPACE" --ignore-not-found=true --wait=true --now --timeout=10m
fi

function show_status_until_pxe_ready() {
  set +x # don't spam with our commands
  sleep 15 # let helm upgrade start
  for i in {1..100} ; do
    if kubectl wait pod -l app==pxe --for=condition=Ready -n "transfer" --timeout=20s >/dev/null 2>/dev/null ; then
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
      --set ingress.enabled=true \
      --wait \
      --wait-for-jobs=true \
      --timeout=30m

kubectl wait pod -l app==pxe --for=condition=Ready -n "$NAMESPACE" --timeout=10m

function forward_pxe_k8s_port() {
  # NOTE we fail silently, and work in the background
  kubectl port-forward --namespace transfer svc/spartan-aztec-network-pxe 9082:8080 2>/dev/null >/dev/null || true
}
# tunnel in to get access directly to our PXE service in k8s
(kubectl port-forward --namespace transfer svc/spartan-aztec-network-pxe 9082:8080 2>/dev/null >/dev/null || true) &

# run our test in the host network namespace (so we can access the above with localhost)
docker run --rm --network=host \
  -e SCENARIO=default \
  -e PXE_URL=http://localhost:9082 \
  -e DEBUG="aztec:*" \
  -e LOG_LEVEL=debug \
  -e LOG_JSON=1 \
  aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG $TEST
