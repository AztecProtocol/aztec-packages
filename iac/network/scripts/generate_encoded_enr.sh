#!/usr/bin/env bash

PRIVATE_KEY=${1:-}
UDP_ADDRESS=${2:-}
L1_CHAIN_ID=${3:-}
TAG=${4:-"latest"}

function get_enr {
  docker run --rm aztecprotocol/aztec:$TAG node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js generate-bootnode-enr $PRIVATE_KEY $UDP_ADDRESS -c $L1_CHAIN_ID
}

OUTPUT="$(get_enr)"
ENR=$(echo "$OUTPUT" | awk -F'ENR: ' '{print $2}')
echo $ENR
