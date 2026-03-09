#!/usr/bin/env bash

set -euo pipefail

# Build and publish the IRM monitor image if it doesn't exist
# Usage: ./build-and-publish.sh <image> (e.g., aztecprotocol/block-height-monitor:2.3.4)

IMAGE=${1:-aztecprotocol/block-height-monitor:latest}

echo "Checking if ${IMAGE} exists on Docker Hub..."

# Extract repository and tag from the full image name
REPO="${IMAGE%%:*}"
TAG="${IMAGE##*:}"

echo "REPO: ${REPO}"
echo "TAG: ${TAG}"

if curl -fsSL "https://hub.docker.com/v2/repositories/${REPO}/tags/${TAG}" >/dev/null 2>&1; then
  echo "Image already exists: ${IMAGE}"
  exit 0
fi

if [ -z "${DOCKERHUB_PASSWORD:-}" ]; then
  echo "No DOCKERHUB_PASSWORD provided."
  exit 1
fi

echo $DOCKERHUB_PASSWORD | docker login -u ${DOCKERHUB_USERNAME:-aztecprotocolci} --password-stdin

echo "Building image ${IMAGE}..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."

docker build -t "${IMAGE}" "${ROOT_DIR}"

echo "Pushing ${IMAGE}..."
docker push "${IMAGE}"

echo "Done: ${IMAGE}"
