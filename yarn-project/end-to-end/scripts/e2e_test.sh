#!/bin/bash

# Usage: ./e2e_test.sh <test>
# Optional environment variables:
#   HARDWARE_CONCURRENCY (default: "")
#   ALLOW_FAIL (default: false)

set -eu

# Main positional parameter
TEST="$1"
# Default values for environment variables
HARDWARE_CONCURRENCY="${HARDWARE_CONCURRENCY:-}"
AZTEC_DOCKER_TAG=$(git rev-parse HEAD)

if ! docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -q "aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG"; then
  echo "Docker images not found. They need to be built with 'earthly ./yarn-project/+export-end-to-end' or otherwise tagged with aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG."
  exit 1
fi

docker run -e HARDWARE_CONCURRENCY="$HARDWARE_CONCURRENCY" --rm aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG "$TEST"
