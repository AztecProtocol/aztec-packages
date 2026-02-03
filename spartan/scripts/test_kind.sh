#!/usr/bin/env bash
# Usage: source environments/kind-provers.env && ./test_kind.sh <test_file> [namespace]
# Deploys a network to KIND and runs the specified test.
#
# Prerequisites:
#   Source the appropriate env file before running:
#   - kind-minimal.env: Fast testing with fake provers
#   - kind-provers.env: Real provers (slower, matches next-scenario.env)
#
# Environment variables:
#   OVERRIDES (default: "") - Helm value overrides
#   INSTALL_METRICS (default: "false") - Install metrics stack

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

test_file="${1:?test_file is required}"
namespace="${2:-upgrade-test}"

install_metrics="${INSTALL_METRICS:-false}"

# Ensure KIND cluster is running
../bootstrap.sh kind

# Set up namespace (override NAMESPACE from env file with specific test namespace)
export NAMESPACE="$namespace"
export CLUSTER="kind"

./kind_teardown.sh "$namespace"

# Install metrics if requested
if [ "$install_metrics" = "true" ]; then
  ../bootstrap.sh metrics-kind
fi

abs_kind_teardown="$(pwd)/kind_teardown.sh"
interrupted=false
function cleanup {
  if [ "$interrupted" = "true" ]; then
    return
  fi
  interrupted=true
  "$abs_kind_teardown" "$namespace" || true
}

function handle_interrupt {
  cleanup
  exit 130
}

trap 'cleanup' EXIT
trap 'handle_interrupt' INT TERM

# Deploy the network
echo "Deploying network to KIND namespace: $namespace"
./deploy_network.sh

export DENOISE=1
# Wait for L2 blocks with k8s context injection
# Note: commands run from repo root (ci3/source), so use repo-relative paths
./k8s_enriched_denoise "$namespace" "./wait_for_l2_block.sh $namespace" || true

# Run the test with k8s context injection
echo "Running test: $test_file"
export LOG_LEVEL=${LOG_LEVEL:-"info"}

cd ../../yarn-project/end-to-end
../../spartan/scripts/k8s_enriched_denoise "$namespace" "yarn test --forceExit --testTimeout=10800000 '$test_file'"
