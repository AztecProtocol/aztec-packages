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

# Guard against double-pause (would overwrite saved state with zeros)
if kubectl get configmap "$CONFIGMAP_NAME" -n "$NAMESPACE" &>/dev/null; then
  die "Namespace $NAMESPACE is already paused (ConfigMap $CONFIGMAP_NAME exists). Run network_resume.sh first."
fi

# Snapshot if the cronjob exists (not all networks have snapshots enabled)
SNAPSHOT_CRONJOB="$NAMESPACE-snapshot-aztec-snapshots"
if kubectl get cronjob "$SNAPSHOT_CRONJOB" -n "$NAMESPACE" &>/dev/null; then
  log "Snapshotting $NAMESPACE"
  $scripts_dir/manual_snapshot.sh $NAMESPACE
  log "Waiting for snapshot upload"
  sleep 60
else
  log "Snapshot cronjob not found ($SNAPSHOT_CRONJOB), skipping snapshot"
fi

# Collect current replica counts before scaling down
log "Collecting current replica counts"

SS_JSON=$(kubectl get statefulset -n "$NAMESPACE" -o json | \
  jq '[.items[] | {key: .metadata.name, value: .spec.replicas}] | from_entries')

DEPLOY_JSON=$(kubectl get deployment -n "$NAMESPACE" -o json | \
  jq '[.items[] | {key: .metadata.name, value: .spec.replicas}] | from_entries')

CRONJOB_JSON=$(kubectl get cronjob -n "$NAMESPACE" -o json | \
  jq '[.items[] | select(.spec.suspend != true) | .metadata.name]')

STATE_JSON=$(jq -n \
  --arg paused_at "$(date -Is)" \
  --argjson statefulsets "$SS_JSON" \
  --argjson deployments "$DEPLOY_JSON" \
  --argjson cronjobs "$CRONJOB_JSON" \
  '{paused_at: $paused_at, statefulsets: $statefulsets, deployments: $deployments, cronjobs: $cronjobs}')

log "Saving pause state to ConfigMap $CONFIGMAP_NAME"
kubectl create configmap "$CONFIGMAP_NAME" \
  -n "$NAMESPACE" \
  --from-literal=state="$STATE_JSON"

# Scale everything down except eth-devnet (L1 beacon chain cannot recover from long pauses)
log "Pausing namespace $NAMESPACE"
for item_type in statefulset deployment; do
  for item in $(kubectl get "$item_type" -n "$NAMESPACE" -o json | \
    jq -r '.items[] | select(.metadata.labels["app.kubernetes.io/name"] != "eth-devnet") | .metadata.name'); do
    log "  Scaling $item_type/$item to 0"
    kubectl scale -n "$NAMESPACE" "$item_type/$item" --replicas 0
  done
done

log "Suspending cronjobs"
for item in $(kubectl get cronjob -n $NAMESPACE -o jsonpath='{.items[*].metadata.name}'); do
  kubectl -n $NAMESPACE patch cronjobs $item -p '{"spec" : {"suspend" : true }}'
done

log "Namespace $NAMESPACE paused successfully. State saved to ConfigMap $CONFIGMAP_NAME."
