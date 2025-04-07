# Create new accounts
new_accounts_per_run=2
new_accounts="[]"
max_accounts=2

total_account_count=$(jq '.accounts | length' state.json)
if [ "$total_account_count" -lt "$max_accounts" ]; then

  # New accounts should be the min(num_new_accounts, max_accounts - total_account_count)
  num_new_accounts=$(( new_accounts_per_run < (max_accounts - total_account_count) ? new_accounts_per_run : (max_accounts - total_account_count) ))
  for i in $(seq 1 $num_new_accounts); do
    # TODO(ek): Remove
    echo "Pre register first"
    new_account=$(aztec-wallet create-account -a main --register-only --node-url $NODE_URL --json | grep -Pzo '(?s)\{.*\}')
    aztec-wallet register-contract "$SPONSORED_FPC_ADDRESS" SponsoredFPC --node-url $NODE_URL -f accounts:main --salt 0
    echo "Post register first"
    SPONSORED_FPC_PAYMENT_METHOD="--payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS"
    aztec-wallet deploy-account --node-url $NODE_URL $SPONSORED_FPC_PAYMENT_METHOD
    echo "Post deploy first"

    new_account=$(aztec-wallet create-account -a main --register-only --node-url $NODE_URL --json | grep -Pzo '(?s)\{.*\}')
    new_account=$(echo "$new_account" | jq '. + {"inited": false}')

    echo "$new_account" | jq '.'

    # Store the JSON output in a variable
    l1_account=$(aztec create-l1-account --json)

    # Parse and extract the values
    l1_private_key=$(echo "$l1_account" | jq -r '.privateKey')
    l1_address=$(echo "$l1_account" | jq -r '.address')

    aztec drip-faucet -t ETH -a $l1_address -u $FAUCET_URL

    aztec-wallet \
      bridge-fee-juice 1000000000000000000 accounts:main \
      --mint \
      --node-url $NODE_URL \
      --l1-rpc-urls $L1_URL \
      --l1-chain-id 1337 \
      --l1-private-key $l1_private_key

    # Sleep another 40s because it seems that the wait option on bridging is a bit flaky
    sleep 30s

    # We only use the prover on the first iteration of the loop to avoid duplicating identical proofs
    # TODO(ek): Re-enable after testing
    # prover_to_use=$([ $i -eq 1 ] && echo "-p native" || echo "-p none")
    prover_to_use="-p none"
    aztec-wallet $prover_to_use \
     deploy-account \
     -f accounts:main \
     --payment method=fee_juice,claim \
     --node-url $NODE_URL

    new_accounts=$(echo "$new_accounts" | jq --argjson acc "$new_account" '. += [$acc]')
  done
fi

# Test account deployment with sponsoredFPC
SPONSORED_FPC_PAYMENT_METHOD="--payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS"
aztec-wallet create-account --node-url $NODE_URL $SPONSORED_FPC_PAYMENT_METHOD

echo "$new_accounts" | jq '.'

jq --argjson new_accounts "$new_accounts" '.accounts += $new_accounts' state.json > tmp.json && mv tmp.json state.json
