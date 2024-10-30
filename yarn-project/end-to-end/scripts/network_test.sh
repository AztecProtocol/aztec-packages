#!/bin/bash

# Usage: ./network_test.sh <test>
# Required environment variables:
#   NAMESPACE
# Optional environment variables:
#   VALUES_FILE (default: "default.yaml")
#   INSTALL_CHAOS_MESH (default: "")
#   CHAOS_VALUES (default: "")
#   FRESH_INSTALL (default: "false")
#   AZTEC_DOCKER_TAG (default: current git commit)

set -eux

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Main positional parameter
TEST="$1"

REPO=$(git rev-parse --show-toplevel)
if [ "$(uname)" = "Linux" ] && [ "$(uname -m)" = "x86_64" ]; then
  "$REPO"/spartan/scripts/setup_local_k8s.sh
else
  echo "Not on x64 Linux, not installing k8s and helm."
fi

# Default values for environment variables
VALUES_FILE="${VALUES_FILE:-default.yaml}"
INSTALL_CHAOS_MESH="${INSTALL_CHAOS_MESH:-}"
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

# Handle and check chaos mesh setup
handle_network_shaping() {
    if [ -n "${CHAOS_VALUES:-}" ]; then
        echo "Checking chaos-mesh setup..."

        if ! kubectl get service chaos-daemon -n chaos-mesh &>/dev/null; then
            # If chaos mesh is not installed, we check the INSTALL_CHAOS_MESH flag
            # to determine if we should install it.
            if [ "$INSTALL_CHAOS_MESH" ]; then
              echo "Installing chaos-mesh..."
              cd "$REPO/spartan/chaos-mesh" && ./install.sh
            else
              echo "Error: chaos-mesh namespace not found!"
              echo "Please set up chaos-mesh first. You can do this by running:"
              echo "cd $REPO/spartan/chaos-mesh && ./install.sh"
              exit 1
            fi
        fi

        echo "Deploying network shaping configuration..."
        if ! helm upgrade --install network-shaping "$REPO/spartan/network-shaping/" \
            --namespace chaos-mesh \
            --values "$REPO/spartan/network-shaping/values/$CHAOS_VALUES" \
            --set global.targetNamespace="$NAMESPACE" \
            --wait \
            --timeout=5m; then
            echo "Error: failed to deploy network shaping configuration!"
            return 1
        fi

        echo "Network shaping configuration applied successfully"
        return 0
    fi
    return 0
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

# If we are unable to apply network shaping, as we cannot change existing chaos configurations, then delete existing configurations and try again
if ! handle_network_shaping; then
  echo "Deleting existing network chaos experiments..."
  kubectl delete networkchaos --all --all-namespaces

  if ! handle_network_shaping; then
    echo "Error: failed to apply network shaping configuration!"
    exit 1
  fi
fi

# Start port-forwarding with dynamically allocated free ports
(kubectl port-forward --namespace $NAMESPACE svc/spartan-aztec-network-pxe $PXE_PORT:8080 2>/dev/null >/dev/null || true) &
(kubectl port-forward --namespace $NAMESPACE svc/spartan-aztec-network-ethereum $ANVIL_PORT:8545 2>/dev/null >/dev/null || true) &

docker run --rm --network=host \
  -e PXE_URL=http://127.0.0.1:$PXE_PORT \
  -e DEBUG="aztec:*" \
  -e LOG_LEVEL=debug \
  -e ETHEREUM_HOST=http://127.0.0.1:$ANVIL_PORT \
  -e LOG_JSON=1 \
  aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG $TEST
