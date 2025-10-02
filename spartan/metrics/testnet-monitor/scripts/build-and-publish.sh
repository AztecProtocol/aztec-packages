#!/bin/bash

set -euo pipefail

# Build and publish aztecprotocol/aztec-block-height-monitor if the tag doesn't exist
# Usage: ./build-and-publish.sh <tag>

TAG=${1:-latest}
IMAGE="aztecprotocol/aztec-block-height-monitor:${TAG}"


echo "Checking if ${IMAGE} exists on Docker Hub..."
if curl -fsSL "https://hub.docker.com/v2/repositories/aztecprotocol/aztec-block-height-monitor/tags/${TAG}" >/dev/null 2>&1; then
  echo "Image tag already exists: ${IMAGE}"
  exit 0
fi

echo "Building image ${IMAGE}..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."

docker build -t "${IMAGE}" "${ROOT_DIR}"

echo "Pushing ${IMAGE}..."
docker push "${IMAGE}"

echo "Done: ${IMAGE}"


