#!/bin/bash
set -eu

IMAGE=$1
VALUES=$2

if [ -z "$IMAGE" ]; then
  echo "Usage: $0 <tag> <values>"
  echo "Example: $0 latest 3-validators"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

helm upgrade --install smoke $SCRIPT_DIR/../aztec-network \
      --namespace smoke \
      --create-namespace \
      --values $SCRIPT_DIR/../aztec-network/values/$VALUES.yaml \
      --set images.aztec.image="$IMAGE" \
      --wait \
      --wait-for-jobs=true \
      --timeout=30m
