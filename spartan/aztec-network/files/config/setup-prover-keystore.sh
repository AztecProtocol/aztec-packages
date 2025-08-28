#!/usr/bin/env bash
set -eu

WEB3_SIGNER_URL=${WEB3_SIGNER_URL:-""}

echo "KEY_INDEX_START: $KEY_INDEX_START"
echo "WEB3_SIGNER_URL: ${WEB3_SIGNER_URL}"
echo "MNEMONIC: $(echo $MNEMONIC | cut -d' ' -f1-2)..."

private_key=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $KEY_INDEX_START)
address=$(cast wallet address "$private_key")

remoteSigner=""
publisher=""
proverId=$address

if [ -n "$WEB3_SIGNER_URL" ]; then
  remoteSigner=$(jq -n '{remoteSignerUrl: $url}' --arg url "$WEB3_SIGNER_URL")
  publisher=$address
else
  remoteSigner="null"
  publisher=$private_key
fi

export KEY_STORE_DIRECTORY="/shared/config/keys"
mkdir -p "$KEY_STORE_DIRECTORY"

jq -n '
{
  schemaVersion: 1,
  remoteSigner: $remoteSigner,
  prover: {
    id: $proverId,
    publisher: $publisher,
  }
}
' --argjson remoteSigner "$remoteSigner" \
  --arg publisher "$publisher" \
  --arg proverId "$proverId" > "$KEY_STORE_DIRECTORY/prover.json"

