#!/bin/bash
set -eu

TAG=$1
VALUES=$2

if [ -z "$TAG" ]; then
  echo "Usage: $0 <tag> <values>"
  echo "Example: $0 latest 48-validators"
  exit 1
fi

function cleanup() {
  # kill everything in our process group except our process
  trap - SIGTERM && kill $(pgrep -g $$ | grep -v $$) $(jobs -p) || true
}
trap cleanup SIGINT SIGTERM EXIT

function show_status_until_pxe_ready() {
  set +x # don't spam with our commands
  sleep 15 # let helm upgrade start
  for i in {1..100} ; do
    if kubectl wait pod -l app==pxe --for=condition=Ready -n spartan --timeout=20s >/dev/null 2>/dev/null ; then
      break # we are up, stop showing status
    fi
    # show startup status
    kubectl get pods -n spartan
  done
}
show_status_until_pxe_ready &

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

helm upgrade --install spartan $SCRIPT_DIR/../aztec-network \
      --namespace spartan \
      --create-namespace \
      --values $SCRIPT_DIR/../aztec-network/values/$VALUES.yaml \
      --set images.aztec.image="aztecprotocol/aztec:$TAG" \
      --set network.public=true \
      --wait \
      --wait-for-jobs=true \
      --timeout=30m
