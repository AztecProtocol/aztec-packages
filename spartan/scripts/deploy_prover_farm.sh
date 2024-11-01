#!/bin/bash
set -eu
set -o pipefail

TAG=$1
VALUES=$2
JOB_SOURCE_URL=$3
NAMESPACE=${4:-spartan}
PROD=${5:-true}
PROD_ARGS=""
if [ "$PROD" = "true" ] ; then
  PROD_ARGS="--set network.public=true --set telemetry.enabled=true --set telemetry.otelCollectorEndpoint=http://metrics-opentelemetry-collector.metrics:4318"
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

JOB_SOURCE_URL=http://spartan-aztec-network-prover-node.spartan.svc.cluster.local:8080

if [ -z "$TAG" ]; then
  echo "Usage: $0 <docker image tag> <values> (optional: <namespace>)"
  echo "Example: $0 latest 48-validators devnet"
  exit 1
fi

function cleanup() {
  set +x
  # kill everything in our process group except our process
  trap - SIGTERM && kill $(pgrep -g $$ | grep -v $$) $(jobs -p) &>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT

function log_stern() {
  set +x
  stern $NAMESPACE -n $NAMESPACE 2>&1 > "$SCRIPT_DIR/logs/$NAMESPACE-deploy.log"
}
log_stern &

function upgrade() {
  # pull and resolve the image just to be absolutely sure k8s gets the latest image in the tag we want
  #docker pull --platform linux/amd64 aztecprotocol/aztec:$TAG
  #IMAGE=$(docker inspect --format='{{index .RepoDigests 0}}' aztecprotocol/aztec:$TAG)
  # Load the Docker images into kind
  kind load docker-image aztecprotocol/aztec:$TAG
  IMAGE=aztecprotocol/aztec:$TAG
  if ! [ -z "${PRINT_ONLY:-}" ] ; then
    helm template $NAMESPACE $SCRIPT_DIR/../aztec-network \
          --namespace $NAMESPACE \
          --create-namespace \
          --values $SCRIPT_DIR/../aztec-network/values/$VALUES.yaml $PROD_ARGS \
          --set images.aztec.image="$IMAGE" \
          --set proverAgent.jobSourceUrl=$JOB_SOURCE_URL
  else
    helm upgrade --install $NAMESPACE $SCRIPT_DIR/../aztec-network \
          --namespace $NAMESPACE \
          --create-namespace \
          --values $SCRIPT_DIR/../aztec-network/values/$VALUES.yaml $PROD_ARGS \
          --set images.aztec.image="$IMAGE" \
          --set proverAgent.jobSourceUrl=$JOB_SOURCE_URL \
          --wait \
          --wait-for-jobs=true \
          --timeout=30m 2>&1
  fi
}

# running the helm upgrade, but will try again if the setup l2 contracts job complains about being immutable
if ! upgrade | tee "$SCRIPT_DIR/logs/$NAMESPACE-helm.log" ; then
  if grep 'cannot patch "'$NAMESPACE'-aztec-network-setup-l2-contracts"' "$SCRIPT_DIR/logs/$NAMESPACE-helm.log" ; then
    kubectl delete job $NAMESPACE-aztec-network-setup-l2-contracts -n $NAMESPACE
    upgrade
  fi
fi
