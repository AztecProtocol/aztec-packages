#!/bin/bash
set -eu

IMAGE=$1

if [ -z "$IMAGE" ]; then
  echo "Usage: $0 <image> <values>"
  echo "Example: $0 aztecprotocol:aztec/master"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

helm upgrade --install oitavos $SCRIPT_DIR/../aztec-network \
      --namespace oitavos \
      --create-namespace \
      --values $SCRIPT_DIR/oitavos-spartan.yaml \
      --set images.aztec.image="$IMAGE" \
      --wait \
      --wait-for-jobs=true \
      --timeout=30m
