#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(hash_str $(cache_content_hash .rebuild_patterns) $(../yarn-project/bootstrap.sh hash))

flock scripts/logs/install_deps.lock scripts/install_deps.sh >&2

function network_shaping {
  namespace="$1"
  chaos_values="$2"
  if ! kubectl get service chaos-daemon -n chaos-mesh &>/dev/null; then
    echo "Please set up chaos-mesh first. You can do this by running spartan/bootstrap.sh chaos-mesh"
    exit 1
  fi

  echo "Deploying Aztec Chaos Scenarios..."
  if ! helm upgrade --install aztec-chaos-scenarios aztec-chaos-scenarios \
    --namespace chaos-mesh \
    --values "aztec-chaos-scenarios/values/$chaos_values" \
    --set global.targetNamespace="$namespace" \
    --wait \
    --timeout=5m; then
    echo "Error: failed to deploy Aztec Chaos Scenarios!"
    return 1
  fi
  echo "Aztec Chaos Scenarios applied successfully"
  return 0
}

function gke {
  # For GKE access
  if ! command -v gcloud &> /dev/null; then
    if [ -f /etc/os-release ] && grep -qi "Ubuntu" /etc/os-release; then
      sudo apt update
      sudo apt install -y apt-transport-https ca-certificates gnupg curl
      sudo rm -f /usr/share/keyrings/cloud.google.gpg && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
      echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
      sudo apt install -y google-cloud-cli
      sudo apt install google-cloud-cli-gke-gcloud-auth-plugin
      echo "Now you can run 'gcloud init'. Exiting with 1 as this is a necessary step."
    else
      echo "gcloud not found. This is needed for GKE kubernetes usage." >&2
      echo "If needed, install glcoud and do 'gcloud components install gke-gcloud-auth-plugin', then 'gcloud init'" >&2
    fi
    exit 1
  fi
}

function test_cmds {
  echo "$hash ./spartan/bootstrap.sh test-local"
  if [ "$(arch)" == "arm64" ]; then
    # Currently maddiaa/eth2-testnet-genesis is not published for arm64. Skip KIND tests.
    return
  fi
  # Note: commands that start with 'timeout ...' override the default timeout.
  # TODO figure out why these take long sometimes.
  echo "$hash timeout -v 30m ./spartan/bootstrap.sh test-kind-smoke"
  if [ "$CI_FULL" -eq 1 ]; then
    echo "$hash timeout -v 30m ./spartan/bootstrap.sh test-kind-4epochs"
  fi
}

function test {
  echo_header "spartan test"
  test_cmds | parallelise
}

case "$cmd" in
  "")
    # do nothing but the install_deps.sh above
    ;;
  "kind")
    if ! kubectl config get-clusters | grep -q "^kind-kind$" || ! docker ps | grep -q "kind-control-plane"; then
      # Sometimes, kubectl does not have our kind context yet kind registers it as existing
      # Ensure our context exists in kubectl
      # As well if kind-control-plane has been killed, just recreate the cluster
      flock scripts/logs/kind-boot.lock bash -c "kind delete cluster; kind create cluster"
    fi
    kubectl config use-context kind-kind >/dev/null || true
    docker update --restart=no kind-control-plane >/dev/null || true
    ;;
  "chaos-mesh")
    chaos-mesh/install.sh
    ;;
  "metrics-kind")
    metrics/install-kind.sh
    ;;
  "metrics-prod")
    metrics/install-prod.sh
    ;;
  "network-shaping")
    shift
    namespace="$1"
    chaos_values="$2"
    if network_shaping "$namespace" "$chaos_values"; then
      exit
    fi
    # If we are unable to apply network shaping, as we cannot change existing chaos configurations, then delete existing configurations and try again
    echo "Deleting existing network chaos experiments..."
    kubectl delete networkchaos --all --all-namespaces
    network_shaping "$namespace" "$chaos_values"
    ;;
  "hash")
    echo $hash
    ;;
  "test-cmds")
    test_cmds
    ;;
  "test")
    test
    ;;
  "test-kind-smoke")
    NAMESPACE=smoke FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false ./scripts/test_kind.sh src/spartan/smoke.test.ts ci-smoke.yaml
    ;;
  "test-kind-4epochs")
    NAMESPACE=4epochs FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false ./scripts/test_kind.sh src/spartan/4epochs.test.ts ci.yaml
    ;;
  "test-local")
    # Isolate network stack in docker.
    docker_isolate ../scripts/run_native_testnet.sh -i -val 3
    ;;
  "gke")
    gke
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
