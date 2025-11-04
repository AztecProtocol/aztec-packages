#!/bin/bash

set -euo pipefail

# Build and publish aztecprotocol/aztec-block-height-monitor if the tag doesn't exist
# Usage: ./build-and-publish.sh <tag>

TAG=${1:-latest}
IMAGE="spypsy/block-height-monitor:${TAG}"


echo "Checking if ${IMAGE} exists on Docker Hub..."
if curl -fsSL "https://hub.docker.com/v2/repositories/spypsy/block-height-monitor/tags/${TAG}" >/dev/null 2>&1; then
  echo "Image tag already exists: ${IMAGE}"
  exit 0
fi

if [ -z "${DOCKERHUB_PASSWORD:-}" ]; then
  echo "No DOCKERHUB_PASSWORD provided."
  exit 1
fi

echo $DOCKERHUB_PASSWORD | docker login -u aztecprotocolci --password-stdin

echo "Building image ${IMAGE}..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."

docker build -t "${IMAGE}" "${ROOT_DIR}"

echo "Pushing ${IMAGE}..."
docker push "${IMAGE}"

echo "Done: ${IMAGE}"
