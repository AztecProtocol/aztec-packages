#!/bin/bash
set -eu

TAG=$1
VALUES=$2

if [ -z "$TAG" ]; then
  echo "Usage: $0 <tag> <values>"
  echo "Example: $0 latest 48-validators"
  exit 1
fi

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
