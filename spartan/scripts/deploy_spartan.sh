#!/bin/bash
set -eux
set -o pipefail

TAG=$1
VALUES=$2
NAMESPACE=${3:-spartan}

if [ -z "$IMAGE" ]; then
  echo "Usage: $0 <docker image tag> <values>"
  echo "Example: $0 latest 48-validators"
  exit 1
fi

function cleanup() {
  set +x
  # kill everything in our process group except our process
  trap - SIGTERM && kill $(pgrep -g $$ | grep -v $$) $(jobs -p) &>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT

function show_status_until_pxe_ready() {
  set +x
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
  set +x
  stern $NAMESPACE -n $NAMESPACE 2>&1 > "$SCRIPT_DIR/logs/$NAMESPACE-deploy.log"
}
log_stern &

function upgrade() {
  # pull and resolve the image just to be absolutely sure k8s gets the latest image in the tag we want
  docker pull aztecprotocol/aztec:$TAG
  IMAGE=$(docker inspect --format='{{index .RepoDigests 0}}' aztecprotocol/aztec:$TAG)
  helm upgrade --install $NAMESPACE $SCRIPT_DIR/../aztec-network \
        --namespace $NAMESPACE \
        --create-namespace \
        --values $SCRIPT_DIR/../aztec-network/values/$VALUES.yaml \
        --set images.aztec.image="$IMAGE" \
        --set network.public=true \
        --wait \
        --wait-for-jobs=true \
        --timeout=30m 2>&1
}
# docker inspect --format='{{index .RepoDigests 0}}' aztecprotocol/aztec:master
if ! upgrade | tee "$SCRIPT_DIR/logs/$NAMESPACE-helm.log" ; then
  if grep 'cannot patch "'$NAMESPACE'-aztec-network-setup-l2-contracts"' "$SCRIPT_DIR/logs/$NAMESPACE-helm.log" ; then
    kubectl delete job $NAMESPACE-aztec-network-setup-l2-contracts -n $NAMESPACE
    upgrade
  fi
fi