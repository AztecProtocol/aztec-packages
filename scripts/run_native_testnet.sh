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

Usage:
  ./run_native_testnet.sh [options]

Options:
  -h: Display help message
  -t: Specify a custom test script (default: ./test-transfer.sh)
  -v: Specify the number of validators (default: 3)
'

# Function to display help message
display_help() {
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -h     Display this help message"
    echo "  -t     Specify the test script file (default: ./test-transfer.sh)"
    echo "  -v     Specify the number of validators (default: 3)"
    echo
    echo "Example:"
    echo "  $0 -t ./custom-test.sh -v 5"
}

# Default values
TEST_SCRIPT="./test-transfer.sh"
NUM_VALIDATORS=3

# Parse command line arguments
while getopts "ht:v:" opt; do
  case $opt in
    h)
      display_help
      exit 0
      ;;
    t) TEST_SCRIPT="$OPTARG"
      ;;
    v) NUM_VALIDATORS="$OPTARG"
      ;;
    \?) echo "Invalid option -$OPTARG" >&2
        display_help
        exit 1
      ;;
  esac
done

# Base command
BASE_CMD="./yarn-project/end-to-end/scripts/native_network_test.sh \
        $TEST_SCRIPT \
        ./deploy-l1-contracts.sh \
        ./deploy-l2-contracts.sh \
        ./boot-node.sh \
        ./ethereum.sh \
        \"./prover-node.sh false\" \
        ./pxe.sh \
        ./transaction-bot.sh"

# Generate validator commands
for ((i=0; i<NUM_VALIDATORS; i++))
do
    PORT=$((8081 + i))
    BASE_CMD+=" \"./validator.sh $PORT\""
done

# Execute the command
eval $BASE_CMD
