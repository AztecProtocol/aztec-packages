#!/usr/bin/env bash
set -eu

VALIDATORS_PER_NODE=${VALIDATORS_PER_NODE:-1}
PUBLISHERS_PER_VALIDATOR_KEY=${PUBLISHERS_PER_VALIDATOR_KEY:-1}

# We get the index in the config map from the pod name, which will have the service index within it
# For multiple validators per node, we need to multiply the pod index by VALIDATORS_PER_NODE
POD_INDEX=$(echo $K8S_POD_NAME | awk -F'-' '{print $NF}')
KEY_INDEX=$((POD_INDEX * VALIDATORS_PER_NODE))
# Add the index to the start index to get the private key index
PRIVATE_KEY_INDEX=$((KEY_INDEX_START + KEY_INDEX))

# Calculate publisher key starting index for this pod
PUBLISHER_KEY_INDEX=$((PUBLISHER_KEY_INDEX_START + (POD_INDEX * VALIDATORS_PER_NODE * PUBLISHERS_PER_VALIDATOR_KEY)))

WEB3_SIGNER_URL=${WEB3_SIGNER_URL:-""}

echo "POD_INDEX: $POD_INDEX"
echo "KEY_INDEX: $KEY_INDEX"
echo "KEY_INDEX_START: $KEY_INDEX_START"
echo "PRIVATE_KEY_INDEX: $PRIVATE_KEY_INDEX"
echo "PUBLISHER_KEY_INDEX_START: $PUBLISHER_KEY_INDEX_START"
echo "PUBLISHER_KEY_INDEX: $PUBLISHER_KEY_INDEX"
echo "WEB3_SIGNER_URL: ${WEB3_SIGNER_URL}"
# Specific for validators that can hold multiple keys on one node
echo "VALIDATORS_PER_NODE: ${VALIDATORS_PER_NODE}"
echo "PUBLISHERS_PER_VALIDATOR_KEY: ${PUBLISHERS_PER_VALIDATOR_KEY}"
echo "MNEMONIC: $(echo $MNEMONIC | cut -d' ' -f1-2)..."

private_keys=()
addresses=()

# Generate validator keys (attesters)
for ((i = 0; i < VALIDATORS_PER_NODE; i++)); do
  current_index=$((PRIVATE_KEY_INDEX + i))
  private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $current_index)
  address=$(cast wallet address --private-key $private_key)

  if [ -z "$WEB3_SIGNER_URL" ]; then
    private_keys+=("$private_key")
  fi
  addresses+=("$address")
done

# Generate publisher keys
publisher_private_keys=()
publisher_addresses=()

total_publishers=$((VALIDATORS_PER_NODE * PUBLISHERS_PER_VALIDATOR_KEY))

for ((i = 0; i < total_publishers; i++)); do
  current_pub_index=$((PUBLISHER_KEY_INDEX + i))
  pub_private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $current_pub_index)
  pub_address=$(cast wallet address --private-key $pub_private_key)

  publisher_private_keys+=("$pub_private_key")
  publisher_addresses+=("$pub_address")
done

remoteSigner=""
attesters=()
publishers=()

if [ -n "$WEB3_SIGNER_URL" ]; then
  remoteSigner=$(jq -n '{remoteSignerUrl: $url}' --arg url "$WEB3_SIGNER_URL")
  attesters=(${addresses[*]})
  # TODO: switch to addresses once web3signer supports EIP-4844 txs. See https://github.com/Consensys/web3signer/pull/1096
  publishers=(${publisher_private_keys[*]})
else
  remoteSigner="null"
  attesters=(${private_keys[*]})
  # Without web3signer, use private keys for publishers
  publishers=(${publisher_private_keys[*]})
fi

export KEY_STORE_DIRECTORY="/shared/config/keys"
mkdir -p "$KEY_STORE_DIRECTORY"

# Build validators array with multiple entries
validators_json="["
for ((v = 0; v < VALIDATORS_PER_NODE; v++)); do
  if [ $v -gt 0 ]; then
    validators_json+=","
  fi

  # Get the attester for this validator
  if [ -n "$WEB3_SIGNER_URL" ]; then
    attester="${addresses[$v]}"
  else
    attester="${private_keys[$v]}"
  fi

  # Get the publisher keys for this validator
  validator_publishers="["
  for ((p = 0; p < PUBLISHERS_PER_VALIDATOR_KEY; p++)); do
    if [ $p -gt 0 ]; then
      validator_publishers+=","
    fi
    pub_index=$((v * PUBLISHERS_PER_VALIDATOR_KEY + p))
    validator_publishers+="\"${publishers[$pub_index]}\""
  done
  validator_publishers+="]"


  validators_json+="{
    \"attester\": \"$attester\",
    \"coinbase\": \"$attester\",
    \"publisher\": $validator_publishers,
    \"feeRecipient\": \"0x0000000000000000000000000000000000000000000000000000000000000000\"
  }"
done
validators_json+="]"

# Create final JSON structure
jq -n --argjson remoteSigner "$remoteSigner" \
      --argjson validators "$validators_json" \
'{
  schemaVersion: 1,
  remoteSigner: $remoteSigner,
  validators: $validators
}' > "$KEY_STORE_DIRECTORY/attesters.json"

echo "Generated configuration for $VALIDATORS_PER_NODE validators with $PUBLISHERS_PER_VALIDATOR_KEY publishers each"
