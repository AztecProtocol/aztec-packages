#!/bin/bash
set -eu
set -o pipefail

TAG=$1
BASE_ARGS="--set network.public=true --set telemetry.enabled=true --set telemetry.otelCollectorEndpoint=http://metrics-opentelemetry-collector.metrics:4318"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker pull aztecprotocol/aztec:$TAG
IMAGE=aztecprotocol/aztec:scenario-$(git rev-parse HEAD)
docker tag aztecprotocol/aztec:$TAG

function show_get_pods_periodic() {
  NAMESPACE=$1
  set +x
  sleep 15 # let helm upgrade start
  kubectl get pods -n $NAMESPACE
  for i in {1..20} ; do
    # Show once a minute x 20 minutes
    kubectl get pods -n $NAMESPACE
    sleep 60
  done
}
function run_scenario() {
  local NAMESPACE=$1
  # pull and resolve the image just to be absolutely sure k8s gets the latest image in the tag we want
  mkdir $NAMESPACE
  cd $NAMESPACE
  shift 1
  kubectl delete namespace $NAMESPACE
  helm template $NAMESPACE $SCRIPT_DIR/../aztec-network \
        --namespace $NAMESPACE \
        --create-namespace \
        "$@" \
        --set images.aztec.image="$IMAGE" > helm-rendered.yaml
  # Create disembodied stern logger to capture all logs redundantly (note, hacky: need to periodically pkill stern)
  nohup stern $NAMESPACE -n $NAMESPACE >log-stream.log &>log-stream.err &
  show_get_pods_periodic &
  helm upgrade --install $NAMESPACE $SCRIPT_DIR/../aztec-network \
        --namespace $NAMESPACE \
        --create-namespace \
        "$@" \
        --set images.aztec.image="$IMAGE" \
        --wait \
        --wait-for-jobs=true \
        --timeout=30m 2>&1
}


