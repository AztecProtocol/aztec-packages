#!/bin/bash

# Helper script for deploying local KIND scenarios.
# Usage: ./deploy_kind.sh <namespace> <values_file=default.yaml>
# Optional environment variables:
#   VALUES_FILE (default: "default.yaml")
#   CHAOS_VALUES (default: "", no chaos installation)
#   AZTEC_DOCKER_TAG (default: current git commit)
#   INSTALL_TIMEOUT (default: 30m)

source $(git rev-parse --show-toplevel)/ci3/source

# Positional parameters.
namespace="$1"
values_file="${2:-default.yaml}"

# Default values for environment variables
chaos_values="${CHAOS_VALUES:-}"
aztec_docker_tag=${AZTEC_DOCKER_TAG:-$(git rev-parse HEAD)}
install_timeout=${INSTALL_TIMEOUT:-30m}

if ! docker_has_image "aztecprotocol/aztec:$aztec_docker_tag"; then
  echo "Aztec Docker image not found. It needs to be built."
  exit 1
fi

# Switch to a KIND cluster (will also pull in necessary dependencies)
../bootstrap.sh kind

# Load the Docker image into kind
kind load docker-image aztecprotocol/aztec:$aztec_docker_tag

function show_status_until_pxe_ready {
  set +x   # don't spam with our commands
  sleep 15 # let helm upgrade start
  for i in {1..100}; do
    if kubectl wait pod -l app==pxe --for=condition=Ready -n "$namespace" --timeout=20s >/dev/null 2>/dev/null; then
      break # we are up, stop showing status
    fi
    # show startup status
    kubectl get pods -n "$namespace"
  done
}

show_status_until_pxe_ready &

function cleanup {
  # kill everything in our process group except our process
  trap - SIGTERM && kill -9 $(pgrep -g $$ | grep -v $$) $(jobs -p) &>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT

# if we don't have a chaos values, remove any existing chaos experiments
if [ -z "$chaos_values" ]; then
  echo "Deleting existing network chaos experiments..."
  kubectl delete networkchaos --all --all-namespaces 2>/dev/null || true
fi

# Some configuration values are set in the eth-devnet/config/config.yaml file
# and are used to generate the genesis.json file.
# We need to read these values and pass them into the eth devnet create.sh script
# so that it can generate the genesis.json and config.yaml file with the correct values.
./generate_devnet_config.sh "$values_file"

# Install the Helm chart
helm upgrade --install spartan ../aztec-network \
  --namespace "$namespace" \
  --create-namespace \
  --values "../aztec-network/values/$values_file" \
  --set images.aztec.image="aztecprotocol/aztec:$aztec_docker_tag" \
  --wait \
  --wait-for-jobs=true \
  --timeout="$install_timeout"

kubectl wait pod -l app==pxe --for=condition=Ready -n "$namespace" --timeout=10m

if [ -n "$chaos_values" ]; then
  ../bootstrap.sh chaos-mesh
  ../bootstrap.sh network-shaping "$chaos_values"
else
  echo "Skipping network chaos configuration (CHAOS_VALUES not set)"
fi