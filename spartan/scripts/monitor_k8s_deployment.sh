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

# Redirect all output to /dev/tty to force unbuffered output directly to terminal
exec > /dev/tty 2> /dev/tty

echo "==== Starting status monitor for namespace $namespace ===="

for i in {1..100}; do
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
    echo -e "\n==== All pods are ready! ====\n"

    # Check if setupL2Contracts is enabled in Helm configuration
    setup_l2_contracts_enabled=false
    if helm get all "$helm_instance" -n "$namespace" 2>/dev/null | grep -q "setupL2Contracts: true"; then
      setup_l2_contracts_enabled=true
      echo "setupL2Contracts is enabled. Looking for setup-l2-contracts pods..."
    else
      echo "setupL2Contracts is not enabled. Skipping setup-l2-contracts monitoring."
    fi

    # Only proceed with setup-l2-contracts monitoring if it's enabled
    if [ "$setup_l2_contracts_enabled" = true ]; then
      # Look for setup-l2-contracts pods in a loop
      l2_contracts_found=false
      max_attempts=50
      attempt=1

      while [ $attempt -le $max_attempts ]; do
        echo -e "\nLooking for setup-l2-contracts pods (attempt $attempt/$max_attempts)..."

        # Check if there are any setup-l2-contracts pods currently existing
        if kubectl get pods -n "$namespace" -l app=setup-l2-contracts -o name 2>/dev/null | grep -q "pod"; then
          echo -e "\n=== setup-l2-contracts Logs (Active) ===\n"
          l2_contracts_found=true

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

          # If the job is complete or no longer running, break out of the loop
          pod_status=$(kubectl get pods -n "$namespace" -l app=setup-l2-contracts -o jsonpath='{.items[0].status.phase}' 2>/dev/null)
          if [ "$pod_status" = "Succeeded" ] || [ "$pod_status" = "Failed" ] || [ -z "$pod_status" ]; then
            echo "setup-l2-contracts job finished with status: $pod_status"
            break
          fi

          # Alternative check - look for job completion
          if kubectl get job -l app=setup-l2-contracts -n "$namespace" 2>/dev/null | grep -q "1/1"; then
            echo "setup-l2-contracts job completed successfully!"
            break
          fi
        fi

        # If we found the pod but job is not complete yet, wait and check again
        if [ "$l2_contracts_found" = true ]; then
          echo "setup-l2-contracts pod found but job not complete yet. Checking again in 5 seconds..."
        else
          echo "No setup-l2-contracts pods found yet. Checking again in 5 seconds..."
        fi

        sleep 5
        ((attempt++))
      done

      # If we never found setup-l2-contracts pods, check for events or jobs indicating completion
      if [ "$l2_contracts_found" = false ]; then
        echo -e "\n=== Looking for completed setup-l2-contracts pods ===\n"

        # Try to find logs from completed pods that might be in the logs
        echo "Checking for setup-l2-contracts in events:"
        kubectl get events -n "$namespace" | grep -i "setup-l2-contracts" || echo "No setup-l2-contracts events found"

        echo -e "\nChecking if the job completed successfully:"
        kubectl get jobs -n "$namespace" | grep -i "setup-l2-contracts" || echo "No setup-l2-contracts job found - it may have been deleted after successful completion due to hook-delete-policy"
      fi
    fi

    echo -e "\n==== Deployment monitoring complete. Stopping log monitor. ====\n"
    break
  fi

  sleep 5
done

# Restore strict mode
set -euo pipefail
