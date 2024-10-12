#!/bin/bash
set -eu

TAG=$1

if [ -z "$TAG" ]; then
  echo "Usage: $0 <tag>"
  echo "Example: $0 latest"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

helm upgrade --install team $SCRIPT_DIR/../aztec-network \
      --namespace team \
      --create-namespace \
      --values $SCRIPT_DIR/oitavos-team.yaml \
      --set images.aztec.image="iamjustmitch/aztec:$TAG" \
      --wait \
      --wait-for-jobs=true \
      --timeout=30m
