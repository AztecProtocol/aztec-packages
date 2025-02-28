#!/bin/bash

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
# ./upgrade_rollup_with_lock.sh \
#   --aztec-docker-tag c5e2b43044862882a68de47cac07b7116e74e51e \
#   --registry 0x29f815e32efdef19883cf2b92a766b7aebadd326 \
#   --address 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 \
#   --deposit-amount 200000000000000000000000 \
#   --mint
#
# where:
#  - aztec-docker-tag is the tag of the aztec docker image to use.
#  - registry is the address of the registry contract.
#  - address is the address that corresponds to whatever mnemonic/private key you are using.
#  - deposit-amount is optional, and if provided, will deposit the specified amount of governance tokens to the address.
#  - mint is optional, and if provided, will mint the governance tokens to the address before depositing.
#
# It can also be used locally by providing an --aztec-bin argument to the path of the aztec binary.
# For example, --aztec-bin /usr/src/yarn-project/aztec/dest/bin/index.js

# export AZTEC_BIN=/home/mitch/aztec-clones/alpha/yarn-project/aztec/dest/bin/index.js
# L1_CHAIN_ID=1337 \
# ./spartan/scripts/upgrade_rollup_with_lock.sh \
#   --aztec-bin $AZTEC_BIN \
#   --registry 0x29f815e32efdef19883cf2b92a766b7aebadd326 \
#   --address 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 \
#   --deposit-amount 10000000000000000 \
#   --mint

# First set from environment variables if they exist
DEPOSIT_AMOUNT=""
MINT=""
SALT=$((RANDOM % 1000000))
# The default path to the aztec binary within the docker image
AZTEC_BIN="/usr/src/yarn-project/aztec/dest/bin/index.js"
AZTEC_DOCKER_TAG=""

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
    --deposit-amount)
      DEPOSIT_AMOUNT="$2"
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
    --address)
      MY_ADDR="$2"
      shift 2
      ;;
    --mint)
      MINT="--mint"
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

if [ -z "$MY_ADDR" ]; then
    echo "Error: --address argument is required"
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
  EXE="docker run --rm --network=host --env-file .env.tmp $IMAGE_NAME $AZTEC_BIN"
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


# if DEPOSIT_AMOUNT is set, we deposit governance tokens
if [ -n "$DEPOSIT_AMOUNT" ]; then
  echo "Depositing $DEPOSIT_AMOUNT governance tokens to $MY_ADDR"
  $EXE deposit-governance-tokens -r $REGISTRY --recipient $MY_ADDR -a $DEPOSIT_AMOUNT $MINT
fi

PAYLOAD=$($EXE deploy-new-rollup -r $REGISTRY --salt $SALT --json --test-accounts | jq -r '.payloadAddress')

PROPOSAL_ID=$($EXE propose-with-lock -r $REGISTRY --payload-address $PAYLOAD --json | jq -r '.proposalId')

$EXE vote-on-governance-proposal --proposal-id $PROPOSAL_ID --in-favor true --wait true -r $REGISTRY

$EXE execute-governance-proposal --proposal-id $PROPOSAL_ID --wait true -r $REGISTRY
