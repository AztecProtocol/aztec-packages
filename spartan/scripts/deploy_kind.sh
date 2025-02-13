#!/bin/bash

# Helper script for deploying local KIND scenarios.
# Overrides refers to overriding values in the values yaml file
# Usage: ./deploy_kind.sh <namespace> <values_file=default.yaml>
# Optional environment variables:
#   VALUES_FILE (default: "default.yaml")
#   CHAOS_VALUES (default: "", no chaos installation)
#   AZTEC_DOCKER_TAG (default: current git commit)
#   INSTALL_TIMEOUT (default: 30m)
#   OVERRIDES (default: "", no overrides)

source $(git rev-parse --show-toplevel)/ci3/source

# Positional parameters.
namespace="$1"
values_file="${2:-default.yaml}"
sepolia_deployment="${3:-false}"

# Default values for environment variables
chaos_values="${CHAOS_VALUES:-}"
aztec_docker_tag=${AZTEC_DOCKER_TAG:-$(git rev-parse HEAD)}
install_timeout=${INSTALL_TIMEOUT:-30m}
overrides="${OVERRIDES:-}"

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

function generate_overrides {
  local overrides="$1"
  if [ -n "$overrides" ]; then
    # Split the comma-separated string into an array and generate --set arguments
    IFS=',' read -ra OVERRIDE_ARRAY <<<"$overrides"
    for override in "${OVERRIDE_ARRAY[@]}"; do
      echo "--set $override"
    done
  fi
}

# Some configuration values are set in the eth-devnet/config/config.yaml file
# and are used to generate the genesis.json file.
# We need to read these values and pass them into the eth devnet create.sh script
# so that it can generate the genesis.json and config.yaml file with the correct values.
if [ "$sepolia_deployment" != "true" ]; then
  echo "Generating devnet config..."
  ./generate_devnet_config.sh "$values_file"
fi

# Install the Helm chart
echo "Cleaning up any existing Helm releases..."
helm uninstall spartan -n "$namespace" 2>/dev/null || true
kubectl delete clusterrole spartan-aztec-network-node 2>/dev/null || true
kubectl delete clusterrolebinding spartan-aztec-network-node 2>/dev/null || true

helm_set_args=(
  --set images.aztec.image="aztecprotocol/aztec:$aztec_docker_tag"
)

# If this is a sepolia run, we need to write some values
if [ "$sepolia_deployment" = "true" ]; then
  helm_set_args+=(
    --set ethereum.execution.externalHosts="$EXTERNAL_ETHEREUM_HOSTS"
    --set ethereum.beacon.externalHost="$EXTERNAL_ETHEREUM_CONSENSUS_HOST"
    --set aztec.l1DeploymentMnemonic="$L1_ACCOUNTS_MNEMONIC"
    --set ethereum.deployL1ContractsPrivateKey="$L1_DEPLOYMENT_PRIVATE_KEY"
  )

  if [ -n "${EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY:-}" ]; then
    helm_set_args+=(--set ethereum.beacon.apiKey="$EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY")
  fi

  if [ -n "${EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY_HEADER:-}" ]; then
    helm_set_args+=(--set ethereum.beacon.apiKeyHeader="$EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY_HEADER")
  fi
fi

helm upgrade --install spartan ../aztec-network \
  --namespace "$namespace" \
  --create-namespace \
  "${helm_set_args[@]}" \
  --set images.aztec.image="aztecprotocol/aztec:$aztec_docker_tag" \
  $(generate_overrides "$overrides") \
  --values "../aztec-network/values/$values_file" \
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
