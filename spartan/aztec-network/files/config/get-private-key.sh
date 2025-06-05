#!/usr/bin/env bash
set -eu

# We get the index in the config map from the pod name, which will have the service index within it
# For multiple validators per node, we need to multiply the pod index by VALIDATORS_PER_NODE
POD_INDEX=$(echo $K8S_POD_NAME | awk -F'-' '{print $NF}')
KEY_INDEX=$((POD_INDEX * VALIDATORS_PER_NODE))
# Add the index to the start index to get the private key index
PRIVATE_KEY_INDEX=$((KEY_INDEX_START + KEY_INDEX))

echo "POD_INDEX: $POD_INDEX"
echo "KEY_INDEX: $KEY_INDEX"
echo "KEY_INDEX_START: $KEY_INDEX_START"
echo "PRIVATE_KEY_INDEX: $PRIVATE_KEY_INDEX"
# Specific for validators that can hold multiple keys on one node
echo "VALIDATORS_PER_NODE: ${VALIDATORS_PER_NODE:-1}"
echo "MNEMONIC: $(echo $MNEMONIC | cut -d' ' -f1-2)..."

private_keys=()
for ((i = 0; i < VALIDATORS_PER_NODE; i++)); do
  current_index=$((PRIVATE_KEY_INDEX + i))
  private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $current_index)
  private_keys+=("$private_key")
done

# Other services will use the first  key
private_key=${private_keys[0]}
address=$(cast wallet address "$private_key")

# combine keys
validator_private_keys=$(
  IFS=,
  echo "${private_keys[*]}"
)

# Note, currently writing keys for all services for convenience
cat <<EOF >/shared/config/keys.env
export VALIDATOR_PRIVATE_KEYS=$validator_private_keys
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
