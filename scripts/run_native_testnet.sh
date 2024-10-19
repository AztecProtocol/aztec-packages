#!/bin/bash

: '
This script sets up and runs a native testnet for the Aztec network.

Steps:
1. Parse command-line arguments for custom test script and number of validators.
2. Set up the base command for running the native network test, including:
   - Running the specified test script
   - Deploying L1 and L2 contracts
   - Starting the boot node
   - Setting up the Ethereum environment
   - Starting the prover node
   - Starting the PXE
   - Starting the transaction bot
3. Dynamically generate commands for the specified number of validators,
   each with an incrementing port number starting from 8081.
4. Execute the complete command to start the testnet.

Usage: Run with -h to see display_help output below.
'

# Default values
TEST_FILE=src/spartan/transfer.test.ts
PROVER_SCRIPT="\"./prover-node.sh 7900 false\""
NUM_VALIDATORS=3

# Function to display help message
display_help() {
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -h     Display this help message"
    echo "  -t     Specify the test file (default: src/spartan/transfer.test.ts)"
    echo "  -p     Specify the prover command (default: $PROVER_SCRIPT)"
    echo "  -v     Specify the number of validators (default: $NUM_VALIDATORS)"
    echo
    echo "Example:"
    echo "  $0 -t ./custom-test.sh -v 5"
}

# Parse command line arguments
while getopts "ht:v:" opt; do
  case $opt in
    h)
      display_help
      exit 0
      ;;
    t) TEST_FILE="$OPTARG"
      ;;
    p) PROVER_SCRIPT="\"$OPTARG\""
      ;;
    v) NUM_VALIDATORS="$OPTARG"
      ;;
    \?) echo "Invalid option -$OPTARG" >&2
        display_help
        exit 1
      ;;
  esac
done

# Go to repo root
cd $(git rev-parse --show-toplevel)
if [ $NUM_VALIDATORS = 1 ] ; then
  VALIDATOR_CMD="\"./validator.sh 8081\""
else
  VALIDATOR_CMD="\"./validators.sh $NUM_VALIDATORS\""
fi
# Base command
BASE_CMD="./yarn-project/end-to-end/scripts/native_network_test.sh \
        \"./test.sh $TEST_FILE\" \
        ./deploy-l1-contracts.sh \
        ./deploy-l2-contracts.sh \
        ./boot-node.sh \
        ./ethereum.sh \
        $VALIDATOR_CMD \
        $PROVER_SCRIPT \
        ./pxe.sh \
        ./transaction-bot.sh"

# Execute the command
eval $BASE_CMD
