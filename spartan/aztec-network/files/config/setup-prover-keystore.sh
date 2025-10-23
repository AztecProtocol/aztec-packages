#!/usr/bin/env bash
set -eu

PUBLISHERS_PER_PROVER=${PUBLISHERS_PER_PROVER:-1}

WEB3_SIGNER_URL=${WEB3_SIGNER_URL:-""}

echo "KEY_INDEX_START: $KEY_INDEX_START"
echo "PUBLISHER_KEY_INDEX_START: $PUBLISHER_KEY_INDEX_START"
echo "PUBLISHERS_PER_PROVER: $PUBLISHERS_PER_PROVER"
echo "WEB3_SIGNER_URL: ${WEB3_SIGNER_URL}"
echo "MNEMONIC: $(echo $MNEMONIC | cut -d' ' -f1-2)..."

# Generate prover ID key
private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $KEY_INDEX_START)
address=$(cast wallet address "$private_key")

# Generate publisher keys
publishers=()
for ((i = 0; i < PUBLISHERS_PER_PROVER; i++)); do
  current_pub_index=$((PUBLISHER_KEY_INDEX_START + i))
  pub_private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $current_pub_index)
  pub_address=$(cast wallet address --private-key $pub_private_key)

  if [ -n "$WEB3_SIGNER_URL" ]; then
    # With web3signer, use addresses
    publishers+=("$pub_address")
  else
    # Without web3signer, use private keys
    publishers+=("$pub_private_key")
  fi
done

remoteSigner=""
proverId=$address

if [ -n "$WEB3_SIGNER_URL" ]; then
  remoteSigner=$(jq -n '{remoteSignerUrl: $url}' --arg url "$WEB3_SIGNER_URL")
else
  remoteSigner="null"
fi

export KEY_STORE_DIRECTORY="/shared/config/keys"
mkdir -p "$KEY_STORE_DIRECTORY"

# Build publishers array as JSON
publishers_json="["
for ((i = 0; i < ${#publishers[@]}; i++)); do
  if [ $i -gt 0 ]; then
    publishers_json+=","
  fi
  publishers_json+="\"${publishers[$i]}\""
done
publishers_json+="]"

jq -n --argjson remoteSigner "$remoteSigner" \
      --arg proverId "$proverId" \
      --argjson publishers "$publishers_json" \
'{
  schemaVersion: 1,
  remoteSigner: $remoteSigner,
  prover: {
    id: $proverId,
    publisher: $publishers
  }
}' > "$KEY_STORE_DIRECTORY/prover.json"

echo "Generated prover configuration with $PUBLISHERS_PER_PROVER publisher keys"
