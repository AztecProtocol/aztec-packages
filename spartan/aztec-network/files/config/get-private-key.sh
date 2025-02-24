#!/bin/bash
set -eu

# We get the index in the config map from the pod name, which will have the validator index within it
KEY_INDEX=$(echo $POD_NAME | awk -F'-' '{print $NF}')
# Add the index to the start index to get the private key index
PRIVATE_KEY_INDEX=$((KEY_INDEX_START + KEY_INDEX))

echo "KEY_INDEX: $KEY_INDEX"
echo "KEY_INDEX_START: $KEY_INDEX_START"
echo "PRIVATE_KEY_INDEX: $PRIVATE_KEY_INDEX"
echo "MNEMONIC: $(echo $MNEMONIC | cut -d' ' -f1-2)..."

# Get the private key from the mnemonic
private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $PRIVATE_KEY_INDEX)

# Note, currently writing both prover and sequencer keys for all nodes for convinience
cat <<EOF >/shared/config/keys.env
export VALIDATOR_PRIVATE_KEY=$private_key
export L1_PRIVATE_KEY=$private_key
export SEQ_PUBLISHER_PRIVATE_KEY=$private_key
export PROVER_PUBLISHER_PRIVATE_KEY=$private_key
export BOT_L1_PRIVATE_KEY=$private_key
EOF

cat /shared/config/keys.env
