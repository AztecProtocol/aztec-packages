#!/bin/sh

set -eu

# Given a mnemonic and a start index, generate the validator addresses
# (the number of replicas is given by the NUMBER_OF_VALIDATORS env variable)
# Usage:
# Requires:
# - MNEMONIC
# - KEY_INDEX_START
# - NUMBER_OF_VALIDATORS
# source /scripts/get-validator-addresses.sh

# Initialize empty string for validator addresses
VALIDATOR_ADDRESSES_LIST=""

i=$KEY_INDEX_START
while [ $i -lt $NUMBER_OF_VALIDATORS ]; do
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

cat <<EOF >./shared/config/validator-addresses
export VALIDATOR_ADDRESSES=$VALIDATOR_ADDRESSES_LIST
EOF

cat ./shared/config/validator-addresses
