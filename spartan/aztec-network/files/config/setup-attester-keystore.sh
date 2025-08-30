#!/usr/bin/env bash
set -eu

VALIDATORS_PER_NODE=${VALIDATORS_PER_NODE:-1}

# We get the index in the config map from the pod name, which will have the service index within it
# For multiple validators per node, we need to multiply the pod index by VALIDATORS_PER_NODE
POD_INDEX=$(echo $K8S_POD_NAME | awk -F'-' '{print $NF}')
KEY_INDEX=$((POD_INDEX * VALIDATORS_PER_NODE))
# Add the index to the start index to get the private key index
PRIVATE_KEY_INDEX=$((KEY_INDEX_START + KEY_INDEX))

WEB3_SIGNER_URL=${WEB3_SIGNER_URL:-""}

echo "POD_INDEX: $POD_INDEX"
echo "KEY_INDEX: $KEY_INDEX"
echo "KEY_INDEX_START: $KEY_INDEX_START"
echo "PRIVATE_KEY_INDEX: $PRIVATE_KEY_INDEX"
echo "WEB3_SIGNER_URL: ${WEB3_SIGNER_URL}"
# Specific for validators that can hold multiple keys on one node
echo "VALIDATORS_PER_NODE: ${VALIDATORS_PER_NODE}"
echo "MNEMONIC: $(echo $MNEMONIC | cut -d' ' -f1-2)..."

private_keys=()
addresses=()

for ((i = 0; i < VALIDATORS_PER_NODE; i++)); do
  current_index=$((PRIVATE_KEY_INDEX + i))
  private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $current_index)
  address=$(cast wallet address --private-key $private_key)

  if [ -z "$WEB3_SIGNER_URL" ]; then
    private_keys+=("$private_key")
  fi
  addresses+=("$address")
done

# Other services will use the first  key
private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $PRIVATE_KEY_INDEX)
address=$(cast wallet address "$private_key")

remoteSigner=""
attesters=()
publisher=""
coinbase=$address

if [ -n "$WEB3_SIGNER_URL" ]; then
  remoteSigner=$(jq -n '{remoteSignerUrl: $url}' --arg url "$WEB3_SIGNER_URL")
  attesters=(${addresses[*]})
  # TODO: switch to address once web3signer supports EIP-4844 txs. See https://github.com/Consensys/web3signer/pull/1096
  publisher=$private_key
else
  remoteSigner="null"
  attesters=(${private_keys[*]})
  publisher=$private_key
fi

export KEY_STORE_DIRECTORY="/shared/config/keys"
mkdir -p "$KEY_STORE_DIRECTORY"

jq -n '
{
  schemaVersion: 1,
  remoteSigner: $remoteSigner,
  validators: [{
    attester: $ARGS.positional,
    coinbase: $coinbase,
    publisher: $publisher,
    feeRecipient: "0x0000000000000000000000000000000000000000000000000000000000000000"
  }]
}
' --argjson remoteSigner "$remoteSigner" \
  --arg publisher "$publisher" \
  --arg coinbase "$coinbase" \
  --args ${attesters[*]} > "$KEY_STORE_DIRECTORY/attesters.json"
