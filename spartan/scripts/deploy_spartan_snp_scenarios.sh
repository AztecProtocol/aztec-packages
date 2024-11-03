#!/bin/bash
set -eu
set -o pipefail

TAG=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker pull aztecprotocol/aztec:$TAG
IMAGE=$(docker inspect --format='{{index .RepoDigests 0}}' aztecprotocol/aztec:$TAG)

$SCRIPT_DIR/setup_local_k8s.sh

function show_get_pods_periodic() {
  local NAMESPACE=$1
  set +x
  sleep 15 # let helm upgrade start
  kubectl get pods -n $NAMESPACE
  for i in {1..20} ; do
    # Show once a minute x 20 minutes
    kubectl get pods -n $NAMESPACE
    sleep 60
  done
}
function deploy_scenario() {
  local NAMESPACE=$1
  local VALUES=$2
  # pull and resolve the image just to be absolutely sure k8s gets the latest image in the tag we want
  mkdir -p $NAMESPACE
  cd $NAMESPACE
  shift 2
  echo "Deploying scenario $NAMESPACE"
  # select our values file and set variables on commandline
  BASE_ARGS="--values $SCRIPT_DIR/../aztec-network/values/$VALUES.yaml --set network.public=true --set telemetry.enabled=true --set telemetry.otelCollectorEndpoint=http://metrics-opentelemetry-collector.metrics:4318"
  kubectl delete namespace $NAMESPACE --ignore-not-found
  helm template $NAMESPACE $SCRIPT_DIR/../aztec-network \
        --namespace $NAMESPACE \
        --create-namespace \
        $BASE_ARGS "$@" \
        --set images.aztec.image="$IMAGE" > helm-rendered.yaml
  # Create disembodied stern logger to capture all logs redundantly (note, hacky: need to periodically pkill stern)
  nohup stern $NAMESPACE -n $NAMESPACE >log-stream.log &>log-stream.err &
  show_get_pods_periodic $NAMESPACE &
  helm upgrade --install $NAMESPACE $SCRIPT_DIR/../aztec-network \
        --namespace $NAMESPACE \
        --create-namespace \
        $BASE_ARGS "$@" \
        --set images.aztec.image="$IMAGE" \
        --wait \
        --wait-for-jobs=true \
        --timeout=30m 2>&1
  echo "Deployed scenario $NAMESPACE"
}

# Test different validators sets
# +4 scenarios
for i in 1 4 16 48 ; do
  sleep 5
  # we rely on $i-validators.yaml existing
  deploy_scenario validators-$i $i-validators &
done

# Test combinations of bots and txIntervalSeconds
# +9 scenarios
for bots in 4 8 16 ; do
  for tx_interval in 5 10 20 ; do
    sleep 5
    deploy_scenario bots-$bots-tx-interval-$tx_interval 4-validators \
      --set bot.replicas=$bots \
      --set bot.txIntervalSeconds=$tx_interval \
      --set bot.privateTransfersPerTx=1 \
      --set bot.publicTransfersPerTx=2 &
  done
done

# Test combinations of bots and transaction load
# +9 scenarios
for bots in 4 8 16 ; do
  for tx_load in 1 4 8 ; do
    sleep 5
    deploy_scenario bots-$bots-tx-load-$tx_load 4-validators \
      --set bot.replicas=$bots \
      --set bot.txIntervalSeconds=$tx_interval \
      --set bot.privateTransfersPerTx=1 \
      --set bot.publicTransfersPerTx=2 &
  done
done

wait
echo "All jobs started. Refer to their individual folders for debug logs, or forward grafana with spartan/metrics/forward.sh."
