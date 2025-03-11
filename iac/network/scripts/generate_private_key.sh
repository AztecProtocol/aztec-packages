#!/usr/bin/env bash
TAG=${1:-"latest"}

function get_key {
  docker run --rm aztecprotocol/aztec:$TAG  node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js generate-p2p-private-key
}
OUTPUT="$(get_key)"
PRIVATE_KEY=$(echo "$OUTPUT" | awk -F'Private key: ' '{print $2}' | awk '{print $1}')
echo $PRIVATE_KEY
