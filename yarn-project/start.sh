#!/usr/bin/env bash

set -e

common="--tel.collectorBaseUrl http://127.0.0.1:4318/ --tel.networkName testnet"
export NODE_OPTIONS="--no-warnings"
export ETHEREUM_HOST=http://127.0.0.1:8545

# --node.deployAztecContracts doesn't work
# in fact passing --node.deployAztecContracts will overwrite the env var to false
# :/
export DEPLOY_AZTEC_CONTRACTS=1

export VALIDATOR_DISABLED=1

case $1 in
  "node")
    export OTEL_SERVICE_NAME=node
    # export SEQ_MIN_SECONDS_BETWEEN_BLOCKS=60
    # export SEQ_MAX_SECONDS_BETWEEN_BLOCKS=60
    # export SEQ_MIN_TX_PER_BLOCK=8
    node aztec/dest/bin/index.js start \
      --node \
      --pxe \
      --archiver \
      --sequencer \
      --bot \
      --tel.serviceName node \
      --node.publisherPrivateKey 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
      $common \
      --port 8080
    ;;

  "prover-node")
    export OTEL_SERVICE_NAME=prover-node
    node aztec/dest/bin/index.js start \
      --prover-node \
      --proverNode.nodeUrl http://127.0.0.1:8080 \
      --proverNode.realProofs 0 \
      --proverNode.proverAgentEnabled false \
      --proverNode.proverId prover-1 \
      --proverNode.txProviderNodeUrl http://127.0.0.1:8080 \
      --archiver \
      $common \
      --port 8090
  ;;

  "prover-agent")
    count=${2:-1}
    pids=()
    function cleanup() {
      for pid in ${pids[@]}; do
        kill -9 $pid
      done
    }

    for i in $(seq 1 $count); do
      export OTEL_SERVICE_NAME=prover-agent-$i
      echo "Starting prover-agent-$i"
      node aztec/dest/bin/index.js start \
        --prover \
        --prover.nodeUrl http://127.0.0.1:8090 \
        --prover.realProofs 0 \
        --prover.proverAgentEnabled true\
        --prover.proverAgentConcurrency 1 \
        --prover.proverAgentPollInterval 10000 \
        --prover.proverTestDelayMs 5000 \
        $common &
      pids+=($!)
      sleep $((1 + $RANDOM % 3)) # sleep between 1 and 3 seconds
    done
    trap cleanup EXIT
    wait
    ;;

esac
