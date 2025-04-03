#!/usr/bin/env bash

set -exu

# NOTICE: This script is intended for non-production (i.e. testnet) use only.

# Deploys a new rollup contract and uses proposeWithLock to propose an upgrade.
# It then waits for the proposal to be active, and then votes in favor of it.
# Finally it waits for the proposal to be executable, and then executes it.
#
# It will also optionally mint/deposit governance tokens.
#
# Example usage:
#
# L1_CHAIN_ID=1337 \
# ETHEREUM_HOST=http://localhost:8545 \
# MNEMONIC="test test test test test test test test test test test junk" \
# ./upgrade_rollup_with_cli.sh \
#   --aztec-docker-image aztecprotocol/aztec:c5e2b43044862882a68de47cac07b7116e74e51e \
#   --registry 0x29f815e32efdef19883cf2b92a766b7aebadd326 \
#   --test-accounts \
#   --sponsored-fpc
#
# where:
#  - aztec-docker-tag is the tag of the aztec docker image to use.
#  - registry is the address of the registry contract.
#  - test-accounts is optional, and if provided, will initialise the genesis state with funded test accounts.
#  - sponsored-fpc is optional, and if provided, will initialise the genesis state with a funded FPC.
#
# It can also be used locally by providing an --aztec-bin argument to the path of the aztec binary.
# For example, --aztec-bin /usr/src/yarn-project/aztec/dest/bin/index.js

# export AZTEC_BIN=/home/mitch/aztec-clones/alpha/yarn-project/aztec/dest/bin/index.js
# L1_CHAIN_ID=1337 \
# ./spartan/scripts/upgrade_rollup_with_cli.sh \
#   --aztec-bin $AZTEC_BIN \
#   --registry 0x29f815e32efdef19883cf2b92a766b7aebadd326 \
#  --test-accounts \
#  --sponsored-fpc

# First set from environment variables if they exist
SALT=$((RANDOM % 1000000))
# The default path to the aztec binary within the docker image
AZTEC_BIN="/usr/src/yarn-project/aztec/dest/bin/index.js"
AZTEC_DOCKER_IMAGE=""
TEST_ACCOUNTS=""
SPONSORED_FPC=""

# Parse command line arguments (these will override env vars if provided)
while [[ $# -gt 0 ]]; do
  case $1 in
    --aztec-docker-image)
      AZTEC_DOCKER_IMAGE="$2"
      shift 2
      ;;
    --aztec-bin)
      AZTEC_BIN="$2"
      shift 2
      ;;
    --salt)
      SALT="$2"
      shift 2
      ;;
    --registry)
      REGISTRY="$2"
      shift 2
      ;;
    --l1-chain-id)
      L1_CHAIN_ID="$2"
      shift 2
      ;;
    --test-accounts)
      TEST_ACCOUNTS="--test-accounts"
      shift 1
      ;;
    --sponsored-fpc)
      SPONSORED_FPC="--sponsored-fpc"
      shift 1
      ;;
    *)
      echo "Unknown parameter: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$REGISTRY" ]; then
    echo "Error: --registry argument is required"
    exit 1
fi

# Only need this in the docker case
cleanup() {
  # Add error handling and force removal
  rm -rf .env.tmp 2>/dev/null || true
}

# if aztec-docker-tag is set, use it
if [ -n "$AZTEC_DOCKER_IMAGE" ]; then
  EXE="docker run --rm --network=host --env-file .env.tmp $AZTEC_DOCKER_IMAGE node --no-warnings $AZTEC_BIN"
  # Check if the image exists locally before pulling it
  if ! docker images $AZTEC_DOCKER_IMAGE -q; then
    echo "Pulling docker image $AZTEC_DOCKER_IMAGE"
    docker pull $AZTEC_DOCKER_IMAGE
  fi
  trap cleanup EXIT INT TERM HUP QUIT
  # Create a temporary .env file
  env > .env.tmp
else
  EXE="node --no-warnings $AZTEC_BIN"
fi

$EXE deploy-new-rollup -r $REGISTRY --salt $SALT --json $TEST_ACCOUNTS $SPONSORED_FPC
