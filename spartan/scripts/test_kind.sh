#!/usr/bin/env bash
# Usage: ./test_kind.sh <test_file> [namespace]
# Deploys a network to KIND and runs the specified test.
#
# Environment variables:
#   FRESH_INSTALL (default: "true") - Delete namespace before deployment
#   OVERRIDES (default: "") - Helm value overrides
#   INSTALL_METRICS (default: "false") - Install metrics stack

set -euo pipefail

source $(git rev-parse --show-toplevel)/ci3/source

cd "$(dirname "$0")/.."

test_file="${1:?test_file is required}"
namespace="${2:-upgrade-test}"

fresh_install="${FRESH_INSTALL:-true}"
install_metrics="${INSTALL_METRICS:-false}"
overrides="${OVERRIDES:-}"

# Ensure KIND cluster is running
./bootstrap.sh kind

# Set up namespace
export NAMESPACE="$namespace"
export CLUSTER="kind"

if [ "$fresh_install" = "true" ]; then
  echo "Deleting existing namespace due to FRESH_INSTALL=true"
  kubectl delete namespace "$namespace" --ignore-not-found=true --wait=true --timeout=10m || true
fi

# Install metrics if requested
if [ "$install_metrics" = "true" ]; then
  ./bootstrap.sh metrics-kind
fi

# Capture logs
mkdir -p scripts/logs
stern_pid=""
function cleanup {
  set +e
  if [ -n "$stern_pid" ]; then
    kill "$stern_pid" 2>/dev/null || true
  fi
  # Upload logs
  (cat "scripts/logs/kind-$namespace.log" 2>/dev/null || true) | cache_log "kind test $test_file" || true

  if [ "$fresh_install" = "true" ]; then
    kubectl delete namespace "$namespace" --ignore-not-found=true --wait=true --timeout=10m || true
  fi
}
trap cleanup EXIT INT TERM

# Start stern to capture logs
if command -v stern &>/dev/null; then
  stern ".*" -n "$namespace" > "scripts/logs/kind-$namespace.log" 2>&1 &
  stern_pid=$!
fi

# Deploy the network
echo "Deploying network to KIND namespace: $namespace"

# Set deployment variables
export CREATE_ETH_DEVNET=true
export CREATE_ROLLUP_CONTRACTS=true
export CREATE_AZTEC_INFRA=true
export VALIDATOR_REPLICAS=4
export PROVER_REPLICAS=1
export REAL_VERIFIER=false  # Use fake proofs for faster testing

# Apply overrides if specified
if [ -n "$overrides" ]; then
  export HELM_OVERRIDES="$overrides"
fi

# Run the deployment
./scripts/deploy_network.sh

# Wait for pods to be ready
echo "Waiting for pods to be ready..."
kubectl wait pod -l app=validator --for=condition=Ready -n "$namespace" --timeout=15m || true

# Run the test
echo "Running test: $test_file"

export LOG_LEVEL="${LOG_LEVEL:-verbose}"
export LOG_JSON="1"
export DEBUG="${DEBUG:-}"

cd ../yarn-project/end-to-end
yarn test --forceExit --testTimeout=10800000 "$test_file"
