#!/usr/bin/env bash

# Helper script for deploying local KIND scenarios.
# Overrides refers to overriding values in the values yaml file
# Usage: ./deploy_kind.sh <namespace> <values_file=default.yaml>
# Optional environment variables:
#   VALUES_FILE (default: "default.yaml")
#   CHAOS_VALUES (default: "", no chaos installation)
#   AZTEC_DOCKER_TAG (default: current git commit)
#   INSTALL_TIMEOUT (default: 30m)
#   OVERRIDES (default: "", no overrides)
#
# Note on OVERRIDES:
# You can use like OVERRIDES="replicas=3,resources.limits.cpu=1"

source $(git rev-parse --show-toplevel)/ci3/source

set -x

# Positional parameters.
target="${1:-kind}"
namespace="$2"
values_file="${3:-default.yaml}"
sepolia_deployment="${4:-false}"
mnemonic_file="${5:-"mnemonic.tmp"}"
helm_instance="${6:-spartan}"

# Default values for environment variables
chaos_values="${CHAOS_VALUES:-}"
aztec_docker_tag=${AZTEC_DOCKER_TAG:-$(git rev-parse HEAD)}
install_timeout=${INSTALL_TIMEOUT:-30m}
overrides="${OVERRIDES:-}"
resources_file="${RESOURCES_FILE:-default.yaml}"
repository="${REPOSITORY:-aztecprotocol/aztec}"

if [ "$target" = "kind" ] ; then
  if ! docker_has_image "$repository:$aztec_docker_tag"; then
    echo "Aztec Docker image not found. It needs to be built."
    exit 1
  fi

  # Switch to a KIND cluster (will also pull in necessary dependencies)
  ../bootstrap.sh kind

  # Load the Docker image into kind
  flock logs/kind-image.lock kind load docker-image $repository:$aztec_docker_tag
elif [ "$target" = "gke" ]; then
  TAGS=$(curl -s https://registry.hub.docker.com/v2/repositories/$repository/tags/$aztec_docker_tag)
  if [[ "$TAGS" != *"not found"* ]]; then
      echo "TAG $aztec_docker_tag available in docker hub"
  else
    echo "Tag $aztec_docker_tag not found, please ensure it is published to docker hub"
    exit 1
  fi
else
  echo "Unknown target: $target"
  exit 1
fi


# Start the deployment monitor in background
./monitor_k8s_deployment.sh "$namespace" "$helm_instance" "app!=setup-l2-contracts" &
status_monitor_pid=$!

function cleanup {
  trap - SIGTERM
  kill $status_monitor_pid 2>/dev/null || true
  kill $(jobs -p) 2>/dev/null || true
  rm "$mnemonic_file" || true
}
trap cleanup SIGINT SIGTERM EXIT

# Function to generate Helm overrides from comma-separated string
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

# if we don't have a chaos values, remove any existing chaos experiments
if [ -z "$chaos_values" ]; then
  echo "Deleting existing network chaos experiments..."
  kubectl delete networkchaos --all --all-namespaces 2>/dev/null || true
fi

# Initialize Helm set arguments
helm_set_args=(
  --set images.aztec.image="$repository:$aztec_docker_tag"
)

# Some configuration values are set in the eth-devnet/config/config.yaml file
# and are used to generate the genesis.json file.
# We need to read these values and pass them into the eth devnet create.sh script
# so that it can generate the genesis.json and config.yaml file with the correct values.
if [ "$sepolia_deployment" = "true" ]; then
  echo "Generating sepolia accounts..."
  # Split EXTERNAL_ETHEREUM_HOSTS by comma and take first host
  # set +x
  export ETHEREUM_HOST=$(echo "$EXTERNAL_ETHEREUM_HOSTS" | cut -d',' -f1)
  ./prepare_sepolia_accounts.sh "$values_file" 1 "$mnemonic_file"
  L1_ACCOUNTS_MNEMONIC="$(cat "$mnemonic_file")"

  # Escape the EXTERNAL_ETHEREUM_HOSTS value for Helm
  ESCAPED_HOSTS=$(echo "$EXTERNAL_ETHEREUM_HOSTS" | sed 's/,/\\,/g' | sed 's/=/\\=/g')

  helm_set_args+=(
    --set ethereum.execution.externalHosts="$ESCAPED_HOSTS"
    --set ethereum.beacon.externalHost="$EXTERNAL_ETHEREUM_CONSENSUS_HOST"
    --set aztec.l1DeploymentMnemonic="$L1_ACCOUNTS_MNEMONIC"
    --set ethereum.deployL1ContractsPrivateKey="$L1_DEPLOYMENT_PRIVATE_KEY"
  )

  if [ -n "${EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY:-}" ]; then
    helm_set_args+=(--set "ethereum.beacon.apiKey=$EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY")
  fi

  if [ -n "${EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY_HEADER:-}" ]; then
    helm_set_args+=(--set "ethereum.beacon.apiKeyHeader=$EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY_HEADER")
  fi
  # set -x
else
  echo "Generating devnet config..."

  # For each spartan run, we write genesis files into a different directory to prevent contention in ci
  export GENESIS_PATH="out-$namespace"
  helm_set_args+=(--set ethereum.genesisBasePath="$GENESIS_PATH")

  ./generate_devnet_config.sh "$values_file"
fi

# Clean up any existing deployment
echo "Cleaning up any existing Helm releases..."
helm uninstall "$helm_instance" -n "$namespace" 2>/dev/null || true
kubectl delete clusterrole "$helm_instance"-aztec-network-node 2>/dev/null || true
kubectl delete clusterrolebinding "$helm_instance"-aztec-network-node 2>/dev/null || true

# Install the Helm chart
helm upgrade --install "$helm_instance" ../aztec-network \
  --namespace "$namespace" \
  --create-namespace \
  "${helm_set_args[@]}" \
  $(generate_overrides "$overrides") \
  -f "../aztec-network/values/$values_file" \
  -f "../aztec-network/resources/$resources_file" \
  --wait \
  --wait-for-jobs=true \
  --timeout="$install_timeout"

# Wait for PXE pods to be ready
kubectl wait pod -l app==pxe --for=condition=Ready -n "$namespace" --timeout=10m

# Configure network chaos if enabled
if [ -n "$chaos_values" ]; then
  ../bootstrap.sh chaos-mesh
  ../bootstrap.sh network-shaping "$chaos_values"
else
  echo "Skipping network chaos configuration (CHAOS_VALUES not set)"
fi
