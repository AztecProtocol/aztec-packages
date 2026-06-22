#!/usr/bin/env bash
set -eu

VALIDATORS_PER_NODE=${VALIDATORS_PER_NODE:-1}
VALIDATOR_PUBLISHERS_PER_REPLICA=${VALIDATOR_PUBLISHERS_PER_REPLICA:-4}

# We get the index in the config map from the pod name, which will have the service index within it
# For multiple validators per node, we need to multiply the pod index by VALIDATORS_PER_NODE
POD_INDEX=$(echo $K8S_POD_NAME | awk -F'-' '{print $NF}')
KEY_INDEX=$((POD_INDEX * VALIDATORS_PER_NODE))
# Add the index to the start index to get the private key index
PRIVATE_KEY_INDEX=$((KEY_INDEX_START + KEY_INDEX))

# Calculate publisher key starting index for this pod (flat per-replica pool)
PUBLISHER_KEY_INDEX=$((POD_INDEX * VALIDATOR_PUBLISHERS_PER_REPLICA + PUBLISHER_KEY_INDEX_START))

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
echo "VALIDATOR_PUBLISHERS_PER_REPLICA: ${VALIDATOR_PUBLISHERS_PER_REPLICA}"
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

# Generate publisher keys (shared pool for this replica)
publisher_private_keys=()
publisher_addresses=()

for ((i = 0; i < VALIDATOR_PUBLISHERS_PER_REPLICA; i++)); do
  current_pub_index=$((PUBLISHER_KEY_INDEX + i))
  pub_private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $current_pub_index)
  pub_address=$(cast wallet address --private-key $pub_private_key)

  publisher_private_keys+=("$pub_private_key")
  publisher_addresses+=("$pub_address")
done

remoteSigner=""
publishers=()

if [ -n "$WEB3_SIGNER_URL" ]; then
  remoteSigner=$(jq -n '{remoteSignerUrl: $url}' --arg url "$WEB3_SIGNER_URL")
  publishers=(${publisher_addresses[*]})
else
  remoteSigner="null"
  # Without web3signer, use private keys for publishers
  publishers=(${publisher_private_keys[*]})
fi

export KEY_STORE_DIRECTORY="/shared/config/keys"
mkdir -p "$KEY_STORE_DIRECTORY"

# Build top-level publisher array (shared by all validators on this replica)
publishers_json="["
for ((p = 0; p < VALIDATOR_PUBLISHERS_PER_REPLICA; p++)); do
  if [ $p -gt 0 ]; then
    publishers_json+=","
  fi
  publishers_json+="\"${publishers[$p]}\""
done
publishers_json+="]"

# Build validators array with multiple entries (no per-validator publishers)
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

  coinbase="${COINBASE:-$attester}"

  validators_json+="{
    \"attester\": \"$attester\",
    \"coinbase\": \"$coinbase\",
    \"feeRecipient\": \"0x0000000000000000000000000000000000000000000000000000000000000000\"
  }"
done
validators_json+="]"

# Create final JSON structure (schema v2 with top-level publisher array)
jq -n --argjson remoteSigner "$remoteSigner" \
      --argjson validators "$validators_json" \
      --argjson publisher "$publishers_json" \
'{
  schemaVersion: 2,
  remoteSigner: $remoteSigner,
  publisher: $publisher,
  validators: $validators
}' > "$KEY_STORE_DIRECTORY/attesters.json"

echo "Generated configuration for $VALIDATORS_PER_NODE validators with $VALIDATOR_PUBLISHERS_PER_REPLICA shared publishers per replica"
