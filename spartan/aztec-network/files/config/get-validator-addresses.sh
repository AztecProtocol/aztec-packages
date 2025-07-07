#!/bin/sh

set -eu

# Given a mnemonic and a start index, generate the validator addresses
# (the number of nodes is given by NUMBER_OF_VALIDATOR_NODES and each node runs VALIDATORS_PER_NODE validators)
# Usage:
# Requires:
# - MNEMONIC
# - KEY_INDEX_START
# - NUMBER_OF_VALIDATOR_NODES
# - VALIDATORS_PER_NODE
# source /scripts/get-validator-addresses.sh

TOTAL_VALIDATORS=$((NUMBER_OF_VALIDATOR_NODES * VALIDATORS_PER_NODE))

echo "Getting validator addresses for $TOTAL_VALIDATORS validators ($NUMBER_OF_VALIDATOR_NODES nodes with $VALIDATORS_PER_NODE validators each) starting at index $KEY_INDEX_START"
# Echo first 2 words of mnemonic
first_two=$(echo "$MNEMONIC" | cut -d' ' -f1-2)
echo "First two words of mnemonic: $first_two"

# Initialize empty string for validator addresses
VALIDATOR_ADDRESSES_LIST=""

i=$KEY_INDEX_START
while [ $i -lt $((KEY_INDEX_START + TOTAL_VALIDATORS)) ]; do
  # Get the private key from the mnemonic
  private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $i)
  address=$(cast wallet address "$private_key")

  # Append address with comma if not first address
  if [ -n "$VALIDATOR_ADDRESSES_LIST" ]; then
    VALIDATOR_ADDRESSES_LIST="$VALIDATOR_ADDRESSES_LIST,$address"
  else
    VALIDATOR_ADDRESSES_LIST="$address"
  fi

  i=$((i + 1))
done

export VALIDATOR_ADDRESSES=$VALIDATOR_ADDRESSES_LIST
