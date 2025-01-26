#!/bin/bash

# Helper script for deploying local KIND scenarios.
# Usage: ./deploy_kind.sh <namespace>
# Required environment variables:
#   NAMESPACE
# Optional environment variables:
#   VALUES_FILE (default: "default.yaml")
#   CHAOS_VALUES (default: "", no chaos installation)
#   FRESH_INSTALL (default: "false")
#   AZTEC_DOCKER_TAG (default: current git commit)

source $(git rev-parse --show-toplevel)/ci3/source
set -x

# Positional parameters.
namespace="$1"

# Default values for environment variables
values_file="${VALUES_FILE:-default.yaml}"
chaos_values="${CHAOS_VALUES:-}"
FRESH_INSTALL="${FRESH_INSTsALL:-false}"
AZTEC_DOCKER_TAG=${AZTEC_DOCKER_TAG:-$(git rev-parse HEAD)}
INSTALL_TIMEOUT=${INSTALL_TIMEOUT:-30m}
export INSTALL_CHAOS_MESH=${INSTALL_CHAOS_MESH:-true}
export INSTALL_METRICS=${INSTALL_METRICS:-true}

# Check required environment variable
if [ -z "${NAMESPACE:-}" ]; then
  echo "Environment variable NAMESPACE is required."
  exit 1
fi

# Always check for the aztec image
if ! docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -q "aztecprotocol/aztec:$AZTEC_DOCKER_TAG"; then
  echo "Aztec Docker image not found. It needs to be built with 'earthly ./yarn-project/+export-e2e-test-images' or otherwise tagged with aztecprotocol/aztec:$AZTEC_DOCKER_TAG."
  exit 1
fi

# Only check for end-to-end image if a test is specified
if [ -n "$TEST" ] && ! docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -q "aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG"; then
  echo "End-to-end Docker image not found. It needs to be built with 'earthly ./yarn-project/+export-e2e-test-images' or otherwise tagged with aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG."
  exit 1
fi

# Load the Docker images into kind
kind load docker-image aztecprotocol/aztec:$AZTEC_DOCKER_TAG

# If FRESH_INSTALL is true, delete the namespace
if [ "$FRESH_INSTALL" = "true" ]; then
  kubectl delete namespace "$NAMESPACE" --ignore-not-found=true --wait=true --now --timeout=10m
fi

STERN_PID=""
function copy_stern_to_log() {
  stern spartan -n $NAMESPACE >$SCRIPT_DIR/network-test.log &
  STERN_PID=$!
}

function show_status_until_pxe_ready() {
  set +x   # don't spam with our commands
  sleep 15 # let helm upgrade start
  for i in {1..100}; do
    if kubectl wait pod -l app==pxe --for=condition=Ready -n "$NAMESPACE" --timeout=20s >/dev/null 2>/dev/null; then
      break # we are up, stop showing status
    fi
    # show startup status
    kubectl get pods -n "$NAMESPACE"
  done
}

copy_stern_to_log
show_status_until_pxe_ready &

function cleanup() {
  # kill everything in our process group except our process
  trap - SIGTERM && kill -9 $(pgrep -g $$ | grep -v $$) $STERN_PID $(jobs -p) &>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT

# if we don't have a chaos values, remove any existing chaos experiments
if [ -z "$chaos_values" ]; then
  echo "Deleting existing network chaos experiments..."
  kubectl delete networkchaos --all --all-namespaces
fi

values_path="$REPO/spartan/aztec-network/values/$values_file"
export DEFAULT_VALUES_PATH="$REPO/spartan/aztec-network/values.yaml"

# Load the read_values_file.sh script
source "$REPO/yarn-project/end-to-end/scripts/bash/read_values_file.sh"

## Some configuration values are set in the eth-devnet/config/config.yaml file
## and are used to generate the genesis.json file.
## We need to read these values and pass them into the eth devnet create.sh script
## so that it can generate the genesis.json and config.yaml file with the correct values.
$REPO/yarn-project/end-to-end/scripts/bash/generate_devnet_config.sh

# Install the Helm chart
helm upgrade --install spartan "$REPO/spartan/aztec-network/" \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --values "$VALUES_PATH" \
  --set images.aztec.image="aztecprotocol/aztec:$AZTEC_DOCKER_TAG" \
  --wait \
  --wait-for-jobs=true \
  --timeout="$INSTALL_TIMEOUT"

kubectl wait pod -l app==pxe --for=condition=Ready -n "$NAMESPACE" --timeout=10m

FREE_PORTS=$(find_ports 3)

# Extract the free ports from the list
PXE_PORT=$(echo $FREE_PORTS | awk '{print $1}')
ANVIL_PORT=$(echo $FREE_PORTS | awk '{print $2}')
METRICS_PORT=$(echo $FREE_PORTS | awk '{print $3}')

if [ "$INSTALL_METRICS" = "true" ]; then
  GRAFANA_PASSWORD=$(kubectl get secrets -n metrics metrics-grafana -o jsonpath='{.data.admin-password}' | base64 --decode)
else
  GRAFANA_PASSWORD=""
fi

# Namespace variable (assuming it's set)
NAMESPACE=${NAMESPACE:-default}

# Get the values from the values file
ETHEREUM_SLOT_DURATION=$(read_values_file "ethereum.blockTime")
AZTEC_SLOT_DURATION=$(read_values_file "aztec.slotDuration")
AZTEC_EPOCH_DURATION=$(read_values_file "aztec.epochDuration")
AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS=$(read_values_file "aztec.epochProofClaimWindow")
