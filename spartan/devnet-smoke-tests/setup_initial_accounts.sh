# We need these accounts because we deploy contracts with a test account
aztec-wallet import-test-accounts --node-url $NODE_URL

# Register all existing accounts from state
jq -c '.accounts[]' state.json | while read -r account; do
  address=$(echo $account | jq -r '.address')
  secretKey=$(echo $account | jq -r '.secretKey')

  aztec-wallet create-account --secret-key $secretKey --register-only --node-url $NODE_URL
done
