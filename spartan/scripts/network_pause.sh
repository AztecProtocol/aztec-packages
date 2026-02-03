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

log "Snapshotting $NAMESPACE"
$scripts_dir/manual_snapshot.sh $NAMESPACE

log "Waiting for snapshot upload"
sleep 60 # staging-ignition takes 28s

log "Pausing namespace $NAMESPACE"
for item_type in statefulset deployment; do
  for item in $(kubectl get $item_type -n $NAMESPACE -o jsonpath='{.items[*].metadata.name}'); do
    kubectl scale -n $NAMESPACE $item_type/$item --replicas 0
  done
done

log "Suspending cronjobs"
for item in $(kubectl get cronjob -n $NAMESPACE -o jsonpath='{.items[*].metadata.name}'); do
  kubectl -n $NAMESPACE patch cronjobs $item -p '{"spec" : {"suspend" : true }}'
done
