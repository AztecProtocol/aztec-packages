#!/bin/bash
set -eu

TAG=$1
VALUES=$2
NAMESPACE=${3:-spartan}

if [ -z "$TAG" ]; then
  echo "Usage: $0 <tag> <values>"
  echo "Example: $0 latest 48-validators"
  exit 1
fi

function cleanup() {
  # kill everything in our process group except our process
  trap - SIGTERM && kill $(pgrep -g $$ | grep -v $$) $(jobs -p) &>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT

function show_status_until_pxe_ready() {
  sleep 15 # let helm upgrade start
  kubectl get pods -n $NAMESPACE
  for i in {1..20} ; do
    # Show once a minute x 20 minutes
    kubectl get pods -n $NAMESPACE
    sleep 60
  done
}
show_status_until_pxe_ready &
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

function log_stern() {
  stern $NAMESPACE -n $NAMESPACE 2>&1 >> "$SCRIPT_DIR/$NAMESPACE-deploy.log"
}
log_stern &

helm upgrade --install $NAMESPACE $SCRIPT_DIR/../aztec-network \
      --namespace $NAMESPACE \
      --create-namespace \
      --values $SCRIPT_DIR/../aztec-network/values/$VALUES.yaml \
      --set images.aztec.image="aztecprotocol/aztec@sha256:5b6a419315169b7f9ff1d9d16b1ce208e5737067405fda3b924c5669934bac8e" \
      --set network.public=true \
      --wait \
      --wait-for-jobs=true \
      --timeout=30m
