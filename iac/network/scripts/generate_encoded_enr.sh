#!/usr/bin/env bash

PRIVATE_KEY=${1:-}
P2P_IP=${2:-}
P2P_PORT=${3:-}
L1_CHAIN_ID=${4:-}
TAG=${5:-"latest"}

function get_enr {
  docker run --rm aztecprotocol/aztec:$TAG generate-bootnode-enr $PRIVATE_KEY $P2P_IP $P2P_PORT -c $L1_CHAIN_ID
}

OUTPUT="$(get_enr)"
ENR=$(echo "$OUTPUT" | awk -F'ENR: ' '{print $2}')
echo $ENR
