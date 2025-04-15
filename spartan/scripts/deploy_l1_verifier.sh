#!/usr/bin/env bash

set -exu

# NOTICE: This script is intended for non-production (i.e. testnet) use only.

# Deploys an L1 verifier to an existing rollup contract.
#
# Example usage:
#
# L1_CHAIN_ID=1337 \
# ETHEREUM_HOST=http://localhost:8545 \
# MNEMONIC="test test test test test test test test test test test junk" \
# ./deploy_l1_verifier.sh \
#   --aztec-docker-tag c5e2b43044862882a68de47cac07b7116e74e51e \
#   --rollup-address 0x29f815e32efdef19883cf2b92a766b7aebadd326 \
#   --l1-private-key 0xaaaaaaaaaaaaaaaaaaaaaaa
#
# where:
#  - aztec-docker-tag is the tag of the aztec docker image to use.
#  - rollup-address is the address of the rollup contract.
#  - l1-private-key is the private key to use for the L1 transaction.
#
# It can also be used locally by providing an --aztec-bin argument to the path of the aztec binary.
# For example, --aztec-bin /usr/src/yarn-project/aztec/dest/bin/index.js
#
# Example local usage:
# export AZTEC_BIN=/home/mitch/aztec-clones/alpha/yarn-project/aztec/dest/bin/index.js
# L1_CHAIN_ID=1337 \
# ETHEREUM_HOST=http://localhost:8545 \
# ./spartan/scripts/deploy_l1_verifier.sh \
#   --aztec-bin $AZTEC_BIN \
#   --rollup-address 0x29f815e32efdef19883cf2b92a766b7aebadd326 \
#   --l1-private-key 0xaaaaaaaaaaaaaaaaaaaaaaa

# First set from environment variables if they exist
# The default path to the aztec binary within the docker image
AZTEC_BIN="/usr/src/yarn-project/aztec/dest/bin/index.js"
AZTEC_DOCKER_TAG=""
ROLLUP_ADDRESS=""
L1_PRIVATE_KEY=""

# Parse command line arguments (these will override env vars if provided)
while [[ $# -gt 0 ]]; do
  case $1 in
    --aztec-docker-tag)
      AZTEC_DOCKER_TAG="$2"
      shift 2
      ;;
    --aztec-bin)
      AZTEC_BIN="$2"
      shift 2
      ;;
    --rollup-address)
      ROLLUP_ADDRESS="$2"
      shift 2
      ;;
    --l1-private-key)
      L1_PRIVATE_KEY="$2"
      shift 2
      ;;
    *)
      echo "Unknown parameter: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$ROLLUP_ADDRESS" ]; then
    echo "Error: --rollup-address argument is required"
    exit 1
fi

if [ -z "$L1_PRIVATE_KEY" ]; then
    echo "Error: --l1-private-key argument is required"
    exit 1
fi

# Only need this in the docker case
cleanup() {
  # Add error handling and force removal
  rm -rf .env.tmp 2>/dev/null || true
}

# if aztec-docker-tag is set, use it
if [ -n "$AZTEC_DOCKER_TAG" ]; then
  IMAGE_NAME="aztecprotocol/aztec:${AZTEC_DOCKER_TAG}"
  EXE="docker run --rm --network=host --env-file .env.tmp $IMAGE_NAME node --no-warnings $AZTEC_BIN"
  # Check if the image exists locally before pulling it
  if ! docker images $IMAGE_NAME -q; then
    echo "Pulling docker image $IMAGE_NAME"
    docker pull $IMAGE_NAME
  fi
  trap cleanup EXIT INT TERM HUP QUIT
  # Create a temporary .env file
  env > .env.tmp
else
  EXE="node --no-warnings $AZTEC_BIN"
fi

$EXE deploy-l1-verifier --rollup-address $ROLLUP_ADDRESS --l1-private-key $L1_PRIVATE_KEY
