#!/bin/bash

# Generate Aztec validator keys

NUMBER_OF_KEYS=${1:-16}
MNEMONIC=${2:-"test test test test test test test test test test test junk"}

# Initialize arrays to store private keys and addresses
declare -a VALIDATOR_PRIVATE_KEYS
declare -a VALIDATOR_ADDRESSES_LIST

for i in $(seq 0 $(($NUMBER_OF_KEYS - 1))); do
  # Get private key and store it in array
  PRIVATE_KEY=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $i)
  VALIDATOR_PRIVATE_KEYS+=("$PRIVATE_KEY")

  # Get address from private key and store it in array
  ADDRESS=$(cast wallet address "$PRIVATE_KEY")
  VALIDATOR_ADDRESSES_LIST+=("$ADDRESS")
done

# Join addresses with commas
VALIDATOR_ADDRESSES=$(IFS=, ; echo "${VALIDATOR_ADDRESSES_LIST[*]}")
