#!/usr/bin/env bash
set -eu

VALIDATORS_PER_NODE=${VALIDATORS_PER_NODE:-1}

# We get the index in the config map from the pod name, which will have the service index within it
# For multiple validators per node, we need to multiply the pod index by VALIDATORS_PER_NODE
POD_INDEX=$(echo $K8S_POD_NAME | awk -F'-' '{print $NF}')
KEY_INDEX=$((POD_INDEX * VALIDATORS_PER_NODE))
# Add the index to the start index to get the private key index
PRIVATE_KEY_INDEX=$((KEY_INDEX_START + KEY_INDEX))

WEB3_SIGNER_ENABLED=${WEB3_SIGNER_ENABLED:-false}

echo "POD_INDEX: $POD_INDEX"
echo "KEY_INDEX: $KEY_INDEX"
echo "KEY_INDEX_START: $KEY_INDEX_START"
echo "PRIVATE_KEY_INDEX: $PRIVATE_KEY_INDEX"
echo "WEB3_SIGNER_ENABLED: ${WEB3_SIGNER_ENABLED}"
# Specific for validators that can hold multiple keys on one node
echo "VALIDATORS_PER_NODE: ${VALIDATORS_PER_NODE}"
echo "MNEMONIC: $(echo $MNEMONIC | cut -d' ' -f1-2)..."

private_keys=()
addresses=()

for ((i = 0; i < VALIDATORS_PER_NODE; i++)); do
  current_index=$((PRIVATE_KEY_INDEX + i))
  private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $current_index)
  address=$(cast wallet address --private-key $private_key)

  if [ "$WEB3_SIGNER_ENABLED" == "false" ]; then
    private_keys+=("$private_key")
  fi
  addresses+=("$address")
done

# Other services will use the first  key
private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $PRIVATE_KEY_INDEX)
address=$(cast wallet address "$private_key")

# combine keys
validator_private_keys=$(
  IFS=,
  echo "${private_keys[*]}"
)

validator_addresses=$(
  IFS=,
  echo "${addresses[*]}"
)

# Note, currently writing keys for all services for convenience
cat <<EOF >/shared/config/keys.env
export VALIDATOR_PRIVATE_KEYS=$validator_private_keys
export VALIDATOR_ADDRESSES=$validator_addresses
export L1_PRIVATE_KEY=$private_key
export SEQ_PUBLISHER_ADDRESSES=$address
export SEQ_PUBLISHER_PRIVATE_KEY=$private_key
export PROVER_ID=$address
export PROVER_PUBLISHER_ADDRESSES=$address
export PROVER_PUBLISHER_PRIVATE_KEY=$private_key
export BOT_L1_PRIVATE_KEY=$private_key
EOF

if [[ -f "/shared/config/otel-resource" ]]; then
  # rewrite the resource attributes
  echo "export OTEL_RESOURCE_ATTRIBUTES=\"\$OTEL_RESOURCE_ATTRIBUTES,aztec.l1.address=$address\"" >>/shared/config/otel-resource
fi

cat /shared/config/keys.env
