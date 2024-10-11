#!/bin/bash
set -eu

TAG=$1

if [ -z "$TAG" ]; then
  echo "Usage: $0 <tag> <values>"
  echo "Example: $0 latest 48-validators"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

helm upgrade --install oitavos $SCRIPT_DIR/../aztec-network \
      --namespace oitavos \
      --create-namespace \
      --values $SCRIPT_DIR/oitavos-spartan.yaml \
      --set images.aztec.image="iamjustmitch/aztec:$TAG" \
      --wait \
      --wait-for-jobs=true \
      --timeout=30m
