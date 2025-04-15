#!/usr/bin/env bash
set -eu

# We get the index in the config map from the pod name, which will have the service index within it
KEY_INDEX=$(echo $K8S_POD_NAME | awk -F'-' '{print $NF}')
# Add the index to the start index to get the private key index
PRIVATE_KEY_INDEX=$((KEY_INDEX_START + KEY_INDEX))

echo "KEY_INDEX: $KEY_INDEX"
echo "KEY_INDEX_START: $KEY_INDEX_START"
echo "PRIVATE_KEY_INDEX: $PRIVATE_KEY_INDEX"
echo "MNEMONIC: $(echo $MNEMONIC | cut -d' ' -f1-2)..."

# Get the private key from the mnemonic
private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $PRIVATE_KEY_INDEX)
address=$(cast wallet address "$private_key")

# Note, currently writing keys for all services for convenience
cat <<EOF >/shared/config/keys.env
export VALIDATOR_PRIVATE_KEY=$private_key
export L1_PRIVATE_KEY=$private_key
export SEQ_PUBLISHER_PRIVATE_KEY=$private_key
export PROVER_PUBLISHER_PRIVATE_KEY=$private_key
export BOT_L1_PRIVATE_KEY=$private_key
EOF

if [[ -f "/shared/config/otel-resource" ]]; then
  # rewrite the resource attributes
  echo "export OTEL_RESOURCE_ATTRIBUTES=\"\$OTEL_RESOURCE_ATTRIBUTES,aztec.l1.address=$address\"" >>/shared/config/otel-resource
fi

cat /shared/config/keys.env
