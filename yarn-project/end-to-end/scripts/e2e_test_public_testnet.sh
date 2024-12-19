#!/bin/bash

# Usage: ./e2e_test_public_testnet.sh <test>
# Optional environment variables:
#   SEQ_PUBLISHER_PRIVATE_KEY
#   PROVER_PUBLISHER_PRIVATE_KEY
#   ETHEREUM_HOST
#   HARDWARE_CONCURRENCY (default: "")
#   ALLOW_FAIL (default: false)
#   L1_CHAIN_ID (default: "31337")
#   AZTEC_DOCKER_TAG (default: current git commit)

set -eu

# Main positional parameter
TEST="$1"

# Variables with defaults
HARDWARE_CONCURRENCY="${HARDWARE_CONCURRENCY:-}"
L1_CHAIN_ID="${L1_CHAIN_ID:-31337}"
AZTEC_DOCKER_TAG="${AZTEC_DOCKER_TAG:-$(git rev-parse HEAD)}"

# Check if the image exists
if ! docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -q "aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG"; then
  echo "Building end-to-end Docker image..."
  echo "Docker images not found."
  exit 1
fi

# Run the test
docker run \
  -e L1_CHAIN_ID="$L1_CHAIN_ID" \
  -e ETHEREUM_HOST="${ETHEREUM_HOST:-}" \
  -e SEQ_PUBLISHER_PRIVATE_KEY="${SEQ_PUBLISHER_PRIVATE_KEY:-}" \
  -e PROVER_PUBLISHER_PRIVATE_KEY="${PROVER_PUBLISHER_PRIVATE_KEY:-}" \
  -e HARDWARE_CONCURRENCY="$HARDWARE_CONCURRENCY" \
  --rm aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG "$TEST"
