#!/usr/bin/env bash

set -euo pipefail

spartan=$(git rev-parse --show-toplevel)/spartan
scripts_dir=$spartan/scripts

log() { echo "[INFO]  $(date -Is) - $*"; }
err() { echo "[ERROR] $(date -Is) - $*" >&2; }
die() { err "$*"; exit 1; }

usage() {
  echo "Usage: $0 [namespace]"
  echo ""
  echo "Arguments:"
  echo "  namespace   - Kubernetes namespace (default: from NAMESPACE env var)"
  echo ""
  echo "Environment variables:"
  echo "  NAMESPACE          - K8s namespace (required if not passed as argument)"
  echo ""
  exit 1
}

NAMESPACE="${1:-${NAMESPACE:-}}"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
fi

if [[ -z "$NAMESPACE" ]]; then
  usage
fi

CONFIGMAP_NAME="network-pause-state"

# Read saved state
log "Reading pause state from ConfigMap $CONFIGMAP_NAME"
STATE_JSON=$(kubectl get configmap "$CONFIGMAP_NAME" -n "$NAMESPACE" -o jsonpath='{.data.state}') || \
  die "ConfigMap $CONFIGMAP_NAME not found in namespace $NAMESPACE. Is the network paused?"

echo "$STATE_JSON" | jq . >/dev/null 2>&1 || die "Invalid JSON in ConfigMap $CONFIGMAP_NAME"
paused_at=$(echo "$STATE_JSON" | jq -r '.paused_at')
log "Network was paused at $paused_at"

# Restore statefulset replicas
log "Restoring statefulsets"
for name in $(echo "$STATE_JSON" | jq -r '.statefulsets | keys[]'); do
  replicas=$(echo "$STATE_JSON" | jq -r --arg name "$name" '.statefulsets[$name]')
  if [[ "$replicas" -gt 0 ]]; then
    log "  Scaling statefulset/$name to $replicas replicas"
    kubectl scale -n "$NAMESPACE" statefulset/"$name" --replicas "$replicas"
  fi
done

# Restore deployment replicas
log "Restoring deployments"
for name in $(echo "$STATE_JSON" | jq -r '.deployments | keys[]'); do
  replicas=$(echo "$STATE_JSON" | jq -r --arg name "$name" '.deployments[$name]')
  if [[ "$replicas" -gt 0 ]]; then
    log "  Scaling deployment/$name to $replicas replicas"
    kubectl scale -n "$NAMESPACE" deployment/"$name" --replicas "$replicas"
  fi
done

# Unsuspend only cronjobs that were active before pause
log "Unsuspending cronjobs"
for name in $(echo "$STATE_JSON" | jq -r '.cronjobs[]'); do
  log "  Unsuspending cronjob/$name"
  kubectl -n "$NAMESPACE" patch cronjobs "$name" -p '{"spec" : {"suspend" : false }}'
done

# Clean up
log "Cleaning up ConfigMap $CONFIGMAP_NAME"
kubectl delete configmap "$CONFIGMAP_NAME" -n "$NAMESPACE"

log "Namespace $NAMESPACE resumed successfully."
