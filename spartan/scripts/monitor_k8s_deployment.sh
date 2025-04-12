#!/usr/bin/env bash

# This script monitors the status of a Kubernetes deployment in a given namespace
# Usage: ./monitor_k8s_deployment.sh <namespace> [helm_instance] [additional_label_filter]
#
# Arguments:
#   namespace: The Kubernetes namespace to monitor
#   helm_instance: (Optional) The Helm release name to match in pod labels (default: "spartan")
#   additional_label_filter: (Optional) Additional label filter for non-setup pods (default: "app!=setup-l2-contracts")

set +exuo pipefail

namespace="$1"
helm_instance="${2:-spartan}"
additional_label_filter="${3:-app!=setup-l2-contracts}"

if [ -z "$namespace" ]; then
  echo "Error: Namespace is required"
  exit 1
fi

# Disable strict mode inside the monitoring function

# Function to handle cleanup on exit
function cleanup {
  echo -e "\n==== Deployment monitoring complete. ====\n"
  exit 0
}

# Set up trap for cleanup on script termination
trap cleanup SIGTERM SIGINT EXIT

echo "==== Starting status monitor for namespace $namespace ===="

monitoring_complete=false

for i in {1..100}; do
  if [ "$monitoring_complete" = true ]; then
    echo -e "\n==== Monitoring complete. Exiting. ====\n"
    break
  fi

  echo -e "\n==== STATUS UPDATE ($i) ====\n"
  echo "--- Pod status ---"
  kubectl get pods -n "$namespace" || true

  echo -e "\n--- Control Pane Node Description ---"
  kubectl describe node kind-control-plane || true

  echo -e "\n--- Recent Pod Events ---"
  kubectl get events -n "$namespace" --sort-by='.lastTimestamp' | tail -10 || true

  echo -e "\n--- Pod logs ---"
  for pod in $(kubectl get pods -n "$namespace" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo ""); do
    echo -e "\nLogs from $pod:"
    kubectl logs --tail=10 -n "$namespace" --all-containers=true $pod 2>/dev/null || echo "Cannot get logs yet"
    echo "-------------------"
  done

  if kubectl wait pod -l "$additional_label_filter" -l app.kubernetes.io/instance="$helm_instance" --for=condition="Ready" -n "$namespace" --timeout=20s >/dev/null 2>/dev/null; then
    echo -e "\n==== Deployment monitoring complete. Stopping log monitor. ====\n"
    break
  fi

  sleep 5
done

echo "==== Monitoring complete. Exiting. ===="

# Restore strict mode
set -euo pipefail
