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
#  - test-accounts is optional, and if provided, will initialize the genesis state with funded test accounts.
#  - sponsored-fpc is optional, and if provided, will initialize the genesis state with a funded FPC.
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
  EXE="docker run --rm --network=host --env-file .env.tmp $AZTEC_DOCKER_IMAGE"
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
# $EXE deploy-new-rollup -r $REGISTRY --salt $SALT --json $TEST_ACCOUNTS $SPONSORED_FPC > .deploy_output.json

# # Parse the newly deployed rollup address from the JSON output
# NEW_ROLLUP=$(jq -r '.rollupAddress' < .deploy_output.json)
# echo "New rollup deployed at: $NEW_ROLLUP"

# # Optionally run the governance flow to register the new rollup when not the owner
# # Toggle via env DO_GOVERNANCE=true|false (default true)
# DO_GOVERNANCE=${DO_GOVERNANCE:-true}
# if [ "$DO_GOVERNANCE" = "true" ]; then
#   if [ -z "${ETHEREUM_HOSTS:-}" ] || [ -z "${L1_CHAIN_ID:-}" ]; then
#     echo "ETHEREUM_HOSTS and L1_CHAIN_ID must be set for governance flow" >&2
#     exit 1
#   fi

#   CALLER_ADDRESS="$($EXE generate-l1-account --json | jq -r '.address' || true)"
#   if [ -z "$CALLER_ADDRESS" ] && [ -n "${MNEMONIC:-}" ]; then
#     # Fallback: derive from mnemonic index 0 via cast
#     CALLER_ADDRESS=$(cast wallet address --mnemonic "$MNEMONIC" --mnemonic-index 0)
#   fi
#   echo "Caller address (for governance): ${CALLER_ADDRESS:-unknown}"

#   # Optional: deposit governance tokens if needed (may require minter privileges; disabled by default)
#   # Enable with DEPOSIT_GOVERNANCE_TOKENS=true and set DEPOSIT_AMOUNT (in wei)
#   if [ "${DEPOSIT_GOVERNANCE_TOKENS:-false}" = "true" ]; then
#     AMOUNT=${DEPOSIT_AMOUNT:-100000000000000000000}
#     echo "Depositing governance tokens: $AMOUNT to $CALLER_ADDRESS"
#     $EXE deposit-governance-tokens \
#       -r "$REGISTRY" \
#       --recipient "$CALLER_ADDRESS" \
#       --amount "$AMOUNT" \
#       --mint \
#       --l1-chain-id "$L1_CHAIN_ID" \
#       --l1-rpc-urls "$ETHEREUM_HOSTS"
#   fi

#   # Deploy RegisterNewRollupVersionPayload via bytecode using foundry cast
#   echo "Deploying RegisterNewRollupVersionPayload for registry $REGISTRY and rollup $NEW_ROLLUP"
#   PAYLOAD_BYTECODE=$(node -e "console.log(require('@aztec/l1-artifacts').RegisterNewRollupVersionPayloadBytecode)")
#   CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address,address)" "$REGISTRY" "$NEW_ROLLUP")
#   CREATE_CODE="${PAYLOAD_BYTECODE}${CONSTRUCTOR_ARGS#0x}"
#   MNEMONIC_INDEX=${MNEMONIC_INDEX:-0}
#   TX_JSON=$(cast send --rpc-url "$ETHEREUM_HOSTS" ${PRIVATE_KEY:+--private-key "$PRIVATE_KEY"} ${MNEMONIC:+--mnemonic "$MNEMONIC"} ${MNEMONIC_INDEX:+--mnemonic-index "$MNEMONIC_INDEX"} --json --create "$CREATE_CODE")
#   echo "Payload deploy response: $TX_JSON"
#   PAYLOAD_ADDRESS=$(echo "$TX_JSON" | jq -r '.contractAddress // .contract_address // empty')
#   if [ -z "$PAYLOAD_ADDRESS" ] || [ "$PAYLOAD_ADDRESS" = "null" ]; then
#     TX_HASH=$(echo "$TX_JSON" | jq -r '.transactionHash // .txHash // .hash')
#     echo "Payload deploy tx hash: $TX_HASH"
#     PAYLOAD_ADDRESS=$(cast receipt "$TX_HASH" --rpc-url "$ETHEREUM_HOSTS" --json | jq -r '.contractAddress')
#   fi
#   echo "Payload deployed at: $PAYLOAD_ADDRESS"

#   # Propose with lock
#   echo "Proposing with lock using payload $PAYLOAD_ADDRESS"
#   PROPOSE_OUT=$($EXE propose-with-lock -r "$REGISTRY" --payload-address "$PAYLOAD_ADDRESS" --l1-chain-id "$L1_CHAIN_ID" --json)
#   PROPOSAL_ID=$(echo "$PROPOSE_OUT" | jq -r '.proposalId')
#   echo "Proposal ID: $PROPOSAL_ID"

#   # Vote in favor and wait until active
#   echo "Voting on proposal $PROPOSAL_ID and waiting until active"
#   $EXE vote-on-governance-proposal -r "$REGISTRY" --proposal-id "$PROPOSAL_ID" --in-favor yea --wait true --l1-chain-id "$L1_CHAIN_ID"

#   # Execute when executable
#   echo "Executing proposal $PROPOSAL_ID when executable"
#   $EXE execute-governance-proposal -r "$REGISTRY" --proposal-id "$PROPOSAL_ID" --wait true --l1-chain-id "$L1_CHAIN_ID"
# fi
