#!/bin/bash

# Usage: ./test_kind.sh <test> <values_file=default.yaml>
# The <test> file is located in yarn-project/end-to-end/src/spartan.
# Optional environment variables:
#   NAMESPACE (default: "test-kind")
#   VALUES_FILE (default: "default.yaml")
#   CHAOS_VALUES (default: "")
#   FRESH_INSTALL (default: "false")
#     "false": do a helm upgrade
#     "true": delete namespace before-hand
#     "no-deploy": don't even attempt helm upgrade, target existing KIND cluster
#   AZTEC_DOCKER_TAG (default: current git commit)
#   INSTALL_METRICS (default: "true")
# Used by deploy_kind.sh
#   CHAOS_VALUES (default: "", no chaos installation)
#   AZTEC_DOCKER_TAG (default: current git commit)
#   INSTALL_TIMEOUT (default: 30m)

source $(git rev-parse --show-toplevel)/ci3/source

set -x

# Main positional parameter
test=$1
values_file="${2:-default.yaml}"

# Default values for environment variables
namespace="${NAMESPACE:-test-kind}"
chaos_values="${CHAOS_VALUES:-}"
fresh_install="${FRESH_INSTALL:-false}"
aztec_docker_tag=${AZTEC_DOCKER_TAG:-"$(git rev-parse HEAD)-amd64"}
cleanup_cluster=${CLEANUP_CLUSTER:-false}
install_metrics=${INSTALL_METRICS:-true}
# NOTE: slated for removal along with e2e image!
use_docker=${USE_DOCKER:-true}
sepolia_run=${SEPOLIA_RUN:-false}

OVERRIDES="${OVERRIDES:-}"

# Ensure we have kind context
../bootstrap.sh kind

# Check required environment variable
if [ -z "$namespace" ]; then
  echo "Environment variable NAMESPACE is required."
  exit 1
fi

if [ "$install_metrics" = "true" ]; then
  ../bootstrap.sh metrics-kind
fi

# If fresh_install is true, delete the namespace
if [ "$fresh_install" = "true" ]; then
  echo "Deleting existing namespace due to FRESH_INSTALL=true"
  kubectl delete namespace "$namespace" --ignore-not-found=true --wait=true --now --timeout=10m &>/dev/null || true
fi

function cleanup {
  set +e
  (cat "logs/kind-$namespace.log" || true) | NO_CAT=1 cache_log "kind test $test" || true
  # kill everything in our process group except our process
  trap - SIGTERM && kill $stern_pid $(jobs -p) &>/dev/null || true

  if [ "$cleanup_cluster" = "true" ]; then
    kind delete cluster || true
  elif [ "$fresh_install" = "true" ]; then
    kubectl delete namespace "$namespace" --ignore-not-found=true --wait=true --now --timeout=10m &>/dev/null || true
  fi
}
trap cleanup SIGINT SIGTERM EXIT

stern_pid=""
function copy_stern_to_log {
  # Start stern in a subshell, capture its PID, and pipe output to cache_log so it is uploaded
  stern spartan -n "$namespace" >"logs/kind-$namespace.log" &>/dev/null &
  stern_pid=$!
}

# Start capturing before we start our network deploy
copy_stern_to_log

# uses VALUES_FILE, CHAOS_VALUES, AZTEC_DOCKER_TAG and INSTALL_TIMEOUT optional env vars
if [ "$fresh_install" != "no-deploy" ]; then
  OVERRIDES="$OVERRIDES" ./deploy_kind.sh $namespace $values_file $sepolia_run
fi

# Find 4 free ports between 9000 and 10000
free_ports="$(find_ports 5)"

# Extract the free ports from the list
forwarded_pxe_port=$(echo $free_ports | awk '{print $1}')
forwarded_anvil_port=$(echo $free_ports | awk '{print $2}')
forwarded_metrics_port=$(echo $free_ports | awk '{print $3}')
forwarded_node_port=$(echo $free_ports | awk '{print $4}')
forwarded_sequencer_port=$(echo $free_ports | awk '{print $5}')

if [ "$install_metrics" = "true" ]; then
  grafana_password=$(kubectl get secrets -n metrics metrics-grafana -o jsonpath='{.data.admin-password}' | base64 --decode)
else
  grafana_password=""
fi

value_yamls="../aztec-network/values/$values_file ../aztec-network/values.yaml"

# Get the values from the values file
ethereum_slot_duration=$(./read_value.sh "ethereum.blockTime" $value_yamls)
aztec_slot_duration=$(./read_value.sh "aztec.slotDuration" $value_yamls)
aztec_epoch_duration=$(./read_value.sh "aztec.epochDuration" $value_yamls)
aztec_proof_submission_window=$(./read_value.sh "aztec.proofSubmissionWindow" $value_yamls)
l1_account_mnemonic=$(./read_value.sh "aztec.l1DeploymentMnemonic" $value_yamls)

echo "RUNNING TEST: $test"
# Run test locally.
export K8S="local"
export INSTANCE_NAME="spartan"
export SPARTAN_DIR="$(pwd)/.."
export NAMESPACE="$namespace"
export HOST_PXE_PORT="$forwarded_pxe_port"
export CONTAINER_PXE_PORT="8081"
export HOST_ETHEREUM_PORT="$forwarded_anvil_port"
export CONTAINER_ETHEREUM_PORT="8545"
export HOST_NODE_PORT="$forwarded_node_port"
export CONTAINER_NODE_PORT="8080"
export HOST_SEQUENCER_PORT=$forwarded_sequencer_port
export CONTAINER_SEQUENCER_PORT="8080"
export HOST_METRICS_PORT="$forwarded_metrics_port"
export CONTAINER_METRICS_PORT="80"
export GRAFANA_PASSWORD="$grafana_password"
export DEBUG="${DEBUG:-""}"
export LOG_JSON="1"
export LOG_LEVEL="${LOG_LEVEL:-"debug; info: aztec:simulator, json-rpc"}"
export ETHEREUM_SLOT_DURATION="$ethereum_slot_duration"
export AZTEC_SLOT_DURATION="$aztec_slot_duration"
export AZTEC_EPOCH_DURATION="$aztec_epoch_duration"
export AZTEC_PROOF_SUBMISSION_WINDOW="$aztec_proof_submission_window"
export L1_ACCOUNT_MNEMONIC="$l1_account_mnemonic"
export BOT_L1_MNEMONIC="$l1_account_mnemonic"

yarn --cwd ../../yarn-project/end-to-end test --forceExit "$test"
