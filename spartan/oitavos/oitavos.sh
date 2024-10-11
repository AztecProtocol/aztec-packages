#!/bin/bash
set -eu

IMAGE=$1

if [ -z "$IMAGE" ]; then
  echo "Usage: $0 <tag>"
  echo "Example: $0 latest"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

helm upgrade --install external $SCRIPT_DIR/../aztec-network \
      --namespace external \
      --create-namespace \
      --values $SCRIPT_DIR/external-validators.yaml \
      --set images.aztec.image="$IMAGE" \
      --wait \
      --wait-for-jobs=true \
      --timeout=30m
