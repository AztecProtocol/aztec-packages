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
namespace="$1"
values_file="${2:-default.yaml}"
sepolia_deployment="${3:-false}"
mnemonic_file="${4:-"mnemonic.tmp"}"
helm_instance="${5:-spartan}"

# Default values for environment variables
chaos_values="${CHAOS_VALUES:-}"
aztec_docker_tag=${AZTEC_DOCKER_TAG:-$(git rev-parse HEAD)}
install_timeout=${INSTALL_TIMEOUT:-30m}
overrides="${OVERRIDES:-}"
resources_file="${RESOURCES_FILE:-default.yaml}"

if ! docker_has_image "aztecprotocol/aztec:$aztec_docker_tag"; then
  echo "Aztec Docker image not found. It needs to be built."
  exit 1
fi

# Switch to a KIND cluster (will also pull in necessary dependencies)
../bootstrap.sh kind

# Load the Docker image into kind
flock logs/kind-image.lock kind load docker-image aztecprotocol/aztec:$aztec_docker_tag

# Simple function to check status and display logs
function monitor_status_logs {
  # Create a status monitoring process that pipes directly to /dev/tty
  # This bypasses any output capturing/buffering from the parent script
  (
    # Disable strict mode inside this subshell
    set +exuo pipefail

    # Redirect all output to /dev/tty to force unbuffered output directly to terminal
    exec > /dev/tty 2> /dev/tty

    echo "==== Starting status monitor for namespace $namespace ===="

    for i in {1..100}; do
      echo -e "\n==== STATUS UPDATE ($i) ====\n"
      echo "--- Pod status ---"
      kubectl get pods -n "$namespace" || true

      echo -e "\n--- Recent Pod Events ---"
      kubectl get events -n "$namespace" --sort-by='.lastTimestamp' | tail -10 || true

      echo -e "\n--- Pod logs ---"
      for pod in $(kubectl get pods -n "$namespace" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo ""); do
        echo -e "\nLogs from $pod:"
        kubectl logs --tail=10 -n "$namespace" --all-containers=true $pod 2>/dev/null || echo "Cannot get logs yet"
        echo "-------------------"
      done

      if kubectl wait pod -l app!=setup-l2-contracts -l app.kubernetes.io/instance="$helm_instance" --for=condition="Ready" -n "$namespace" --timeout=20s >/dev/null 2>/dev/null; then
        echo -e "\n==== All pods are ready! Looking for setup-l2-contracts information... ====\n"

        # Check if there are any setup-l2-contracts pods currently existing
        if kubectl get pods -n "$namespace" -l app=setup-l2-contracts -o name 2>/dev/null | grep -q "pod"; then
          echo -e "\n=== setup-l2-contracts Logs (Active) ===\n"

          # Find all setup-l2-contracts pods and show their logs
          for l2_pod in $(kubectl get pods -n "$namespace" -l app=setup-l2-contracts -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo ""); do
            echo -e "\nLogs from $l2_pod:"
            kubectl logs --tail=50 -n "$namespace" $l2_pod 2>/dev/null || echo "Cannot get logs from $l2_pod"
            echo -e "\n-------------------\n"

            # Check pod status
            echo "Status of $l2_pod:"
            kubectl get pod $l2_pod -n "$namespace" -o wide || true
            echo -e "\n-------------------\n"
          done

          # Check if setup-l2-contracts job is complete
          echo "Status of setup-l2-contracts job:"
          kubectl get job -l app=setup-l2-contracts -n "$namespace" || true
        else
          # Check completed pods in case the job has finished but got deleted due to hook-delete-policy
          echo -e "\n=== Looking for completed setup-l2-contracts pods ===\n"

          # Try to find logs from completed pods that might be in the logs
          echo "Checking for setup-l2-contracts in events:"
          kubectl get events -n "$namespace" | grep -i "setup-l2-contracts" || echo "No setup-l2-contracts events found"

          echo -e "\nChecking if the job completed successfully:"
          kubectl get jobs -n "$namespace" | grep -i "setup-l2-contracts" || echo "No setup-l2-contracts job found - it may have been deleted after successful completion due to hook-delete-policy"
        fi

        echo -e "\n==== All pods are ready! Stopping log monitor. ====\n"
        break
      fi

      sleep 5
    done
  ) &

  # Store PID for cleanup
  status_monitor_pid=$!
}

# Run the status monitoring function
monitor_status_logs

function cleanup {
  trap - SIGTERM
  kill $status_monitor_pid 2>/dev/null || true
  kill $(jobs -p) 2>/dev/null || true
  rm "$mnemonic_file" || true
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

helm_set_args=(
  --set images.aztec.image="aztecprotocol/aztec:$aztec_docker_tag"
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
  echo "mnemonic: $mnemonic_file"
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
  ./generate_devnet_config.sh "$values_file"
fi

# Install the Helm chart
echo "Cleaning up any existing Helm releases..."
helm uninstall "$helm_instance" -n "$namespace" 2>/dev/null || true
kubectl delete clusterrole "$helm_instance"-aztec-network-node 2>/dev/null || true
kubectl delete clusterrolebinding "$helm_instance"-aztec-network-node 2>/dev/null || true

helm upgrade --install "$helm_instance" ../aztec-network \
  --namespace "$namespace" \
  --create-namespace \
  "${helm_set_args[@]}" \
  --set images.aztec.image="aztecprotocol/aztec:$aztec_docker_tag" \
  $(generate_overrides "$overrides") \
  -f "../aztec-network/values/$values_file" \
  -f "../aztec-network/resources/$resources_file" \
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
