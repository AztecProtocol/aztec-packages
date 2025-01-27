#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

scripts/install_deps.sh

function network_shaping {
  namespace="$1"
  chaos_values="$2"
  if ! kubectl get service chaos-daemon -n chaos-mesh &>/dev/null; then
    echo "Please set up chaos-mesh first. You can do this by running spartan/bootstrap.sh chaos-mesh"
    exit 1
  fi

  echo "Deleting existing network chaos experiments..."
  kubectl delete networkchaos --all --all-namespace

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

case "$cmd" in
  "")
    # do nothing but the install_deps.sh above
    ;;
  "kind")
    if kubectl config get-clusters | grep -q "^kind-kind$"; then
      echo "Cluster 'kind' already exists. Skipping creation."
    else
      # Sometimes, kubectl does not have our kind context yet kind registers it as existing
      # Ensure our context exists in kubectl
      kind delete cluster || true
      kind create cluster
    fi
    kubectl config use-context kind-kind || true
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
    cache_content_hash .rebuild_patterns ../yarn-project/.rebuild_patterns
    ;;
  "test-kind")
    scripts/test_kind.sh
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
