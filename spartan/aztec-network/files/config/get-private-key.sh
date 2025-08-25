#!/usr/bin/env bash
set -eu

VALIDATORS_PER_NODE=${VALIDATORS_PER_NODE:-1}

# We get the index in the config map from the pod name, which will have the service index within it
# For multiple validators per node, we need to multiply the pod index by VALIDATORS_PER_NODE
POD_INDEX=$(echo $K8S_POD_NAME | awk -F'-' '{print $NF}')
KEY_INDEX=$((POD_INDEX * VALIDATORS_PER_NODE))
# Add the index to the start index to get the private key index
PRIVATE_KEY_INDEX=$((KEY_INDEX_START + KEY_INDEX))

WEB3_SIGNER_URL=${WEB3_SIGNER_URL:-}
KEYSTORE_ENABLED=${KEYSTORE_ENABLED:-false}

echo "POD_INDEX: $POD_INDEX"
echo "KEY_INDEX: $KEY_INDEX"
echo "KEY_INDEX_START: $KEY_INDEX_START"
echo "PRIVATE_KEY_INDEX: $PRIVATE_KEY_INDEX"
echo "WEB3_SIGNER_URL: ${WEB3_SIGNER_URL}"
echo "KEYSTORE_ENABLED: ${KEYSTORE_ENABLED}"
# Specific for validators that can hold multiple keys on one node
echo "VALIDATORS_PER_NODE: ${VALIDATORS_PER_NODE}"
echo "MNEMONIC: $(echo $MNEMONIC | cut -d' ' -f1-2)..."

private_keys=()
addresses=()

for ((i = 0; i < VALIDATORS_PER_NODE; i++)); do
  current_index=$((PRIVATE_KEY_INDEX + i))
  private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $current_index)
  address=$(cast wallet address --private-key $private_key)

  if [ "$WEB3_SIGNER_URL" != "" ]; then
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

# Compute slasher private key if SLASHER_KEY_INDEX_START is set
slasher_private_key=""
if [[ -n "${SLASHER_KEY_INDEX_START:-}" ]]; then
  SLASHER_PRIVATE_KEY_INDEX=$((SLASHER_KEY_INDEX_START + POD_INDEX))
  echo "SLASHER_KEY_INDEX_START: $SLASHER_KEY_INDEX_START"
  echo "SLASHER_PRIVATE_KEY_INDEX: $SLASHER_PRIVATE_KEY_INDEX"
  slasher_private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $SLASHER_PRIVATE_KEY_INDEX)
fi

truncate -s 0 /shared/config/keys.env

if [ "$KEYSTORE_ENABLED" == "true" ]; then
  mkdir -p /shared/config/keystore/

  attester_arg=()
  publisher_arg=""
  if [ "$WEB3_SIGNER_URL" != "" ]; then
    attester_arg=(${addresses[*]})
    publisher_arg=$address
  else 
    attester_arg=(${private_keys[*]})
    publisher_arg=$private_key
  fi

  jq -n '.schemaVersion=1 | .remoteSigner=$WEB3_SIGNER_URL | .validators.attester=$ARGS.positional | .validators.feeRecipient=0x0000000000000000000000000000000000000000000000000000000000000000' \
    --arg WEB3_SIGNER_URL "$WEB3_SIGNER_URL" \
    --args ${attester_arg[*]} > /shared/config/keystore/validator.json

  jq -n '.schemaVersion=1 | .remoteSigner=$WEB3_SIGNER_URL | .prover.id=$PROVER_ID | .prover.publisher=$ARGS.positional' \
    --arg WEB3_SIGNER_URL "$WEB3_SIGNER_URL" \
    --arg PROVER_ID "$address" \
    --args $publisher_arg > /shared/config/keystore/prover.json

  cat "export KEY_STORE_DIRECTORY=/shared/config/keystore/" >>/shared/config/keys.env
  # not creating keystore for slasher because it'll change
else
  # Note, currently writing keys for all services for convenience
  cat <<EOF >/shared/config/keys.env
export VALIDATOR_PRIVATE_KEYS=$validator_private_keys
export WEB3_SIGNER_ADDRESSES=$validator_addresses
export L1_PRIVATE_KEY=$private_key
export SEQ_PUBLISHER_PRIVATE_KEY=$private_key
export PROVER_PUBLISHER_PRIVATE_KEY=$private_key
EOF
fi

  cat <<EOF >>/shared/config/keys.env
export BOT_L1_PRIVATE_KEY=$private_key
EOF

# Only add SLASHER_PRIVATE_KEY if it was computed
if [[ -n "$slasher_private_key" ]]; then
  echo "export SLASHER_PRIVATE_KEY=$slasher_private_key" >>/shared/config/keys.env
fi

if [[ -f "/shared/config/otel-resource" ]]; then
  # rewrite the resource attributes
  echo "export OTEL_RESOURCE_ATTRIBUTES=\"\$OTEL_RESOURCE_ATTRIBUTES,aztec.l1.address=$address\"" >>/shared/config/otel-resource
fi

cat /shared/config/keys.env
