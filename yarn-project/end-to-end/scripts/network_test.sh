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

REPO=$(git rev-parse --show-toplevel)
if [ "$(uname)" = "Linux" ] && [ "$(uname -m)" = "x86_64" ]; then
  # Use a lock so this can be ran in parallel
  "$REPO"/spartan/scripts/setup_local_k8s.sh
else
  echo "Not on x64 Linux, not installing k8s and helm."
fi

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
kind load docker-image aztecprotocol/aztec:$AZTEC_DOCKER_TAG

# If FRESH_INSTALL is true, delete the namespace
if [ "$FRESH_INSTALL" = "true" ]; then
  kubectl delete namespace "$NAMESPACE" --ignore-not-found=true --wait=true --now --timeout=10m
fi

function show_status_until_pxe_ready() {
  set +x # don't spam with our commands
  sleep 15 # let helm upgrade start
  for i in {1..100} ; do
    if kubectl wait pod -l app==pxe --for=condition=Ready -n "$NAMESPACE" --timeout=20s >/dev/null 2>/dev/null ; then
      break # we are up, stop showing status
    fi
    # show startup status
    kubectl get pods -n "$NAMESPACE"
  done
}

show_status_until_pxe_ready &

function cleanup() {
  # kill everything in our process group except our process
  trap - SIGTERM && kill $(pgrep -g $$ | grep -v $$) $(jobs -p) &>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT
# Install the Helm chart
helm upgrade --install spartan "$REPO/spartan/aztec-network/" \
      --namespace "$NAMESPACE" \
      --create-namespace \
      --values "$REPO/spartan/aztec-network/values/$VALUES_FILE" \
      --set images.aztec.image="aztecprotocol/aztec:$AZTEC_DOCKER_TAG" \
      --set ingress.enabled=true \
      --wait \
      --wait-for-jobs=true \
      --timeout=30m

kubectl wait pod -l app==pxe --for=condition=Ready -n "$NAMESPACE" --timeout=10m

# Find two free ports between 9000 and 10000
FREE_PORTS=$(comm -23 <(seq 9000 10000 | sort) <(ss -Htan | awk '{print $4}' | cut -d':' -f2 | sort -u) | shuf | head -n 2)

# Extract the two free ports from the list
PXE_PORT=$(echo $FREE_PORTS | awk '{print $1}')
ANVIL_PORT=$(echo $FREE_PORTS | awk '{print $2}')

# Namespace variable (assuming it's set)
NAMESPACE=${NAMESPACE:-default}

# Start port-forwarding with dynamically allocated free ports
(kubectl port-forward --namespace $NAMESPACE svc/spartan-aztec-network-pxe $PXE_PORT:8080 2>/dev/null >/dev/null || true) &
(kubectl port-forward --namespace $NAMESPACE svc/spartan-aztec-network-ethereum $ANVIL_PORT:8545 2>/dev/null >/dev/null || true) &

docker run --rm --network=host \
  -e PXE_URL=http://127.0.0.1:9082 \
  -e DEBUG="aztec:*" \
  -e LOG_LEVEL=debug \
  -e ETHEREUM_HOST=http://127.0.0.1:9545 \
  -e LOG_JSON=1 \
  aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG $TEST
