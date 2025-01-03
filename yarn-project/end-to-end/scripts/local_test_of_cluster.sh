#!/bin/bash

set -ex

TEST=$1
echo "RUNNING TEST: $TEST"

FREE_PORTS=$(comm -23 <(seq 9000 10000 | sort) <(ss -Htan | awk '{print $4}' | cut -d':' -f2 | sort -u) | shuf | head -n 3)

# Extract the free ports from the list
PXE_PORT=$(echo $FREE_PORTS | awk '{print $1}')
ANVIL_PORT=$(echo $FREE_PORTS | awk '{print $2}')
METRICS_PORT=$(echo $FREE_PORTS | awk '{print $3}')

GRAFANA_PASSWORD=$(kubectl get secrets -n metrics metrics-grafana -o jsonpath='{.data.admin-password}' | base64 --decode)

# Namespace variable (assuming it's set)
NAMESPACE=${NAMESPACE:-smoke}

K8S=local \
INSTANCE_NAME="spartan" \
SPARTAN_DIR="/home/mitch/aztec-clones/alpha/spartan" \
NAMESPACE="$NAMESPACE" \
HOST_PXE_PORT=$PXE_PORT \
CONTAINER_PXE_PORT=8081 \
HOST_ETHEREUM_PORT=$ANVIL_PORT \
CONTAINER_ETHEREUM_PORT=8545 \
HOST_METRICS_PORT=$METRICS_PORT \
CONTAINER_METRICS_PORT=80 \
GRAFANA_PASSWORD=$GRAFANA_PASSWORD \
DEBUG=${DEBUG:-""} \
LOG_JSON=1 \
LOG_LEVEL=${LOG_LEVEL:-"debug; info: aztec:simulator, json-rpc"} \
ETHEREUM_SLOT_DURATION=$ETHEREUM_SLOT_DURATION \
AZTEC_SLOT_DURATION=$AZTEC_SLOT_DURATION \
AZTEC_EPOCH_DURATION=$AZTEC_EPOCH_DURATION \
AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS=$AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS \
yarn test --verbose $TEST
