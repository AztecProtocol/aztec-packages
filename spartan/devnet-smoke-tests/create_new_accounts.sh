# Create new accounts
new_accounts_per_run=2
new_accounts="[]"
max_accounts=2

total_account_count=$(jq '.accounts | length' state.json)
if [ "$total_account_count" -lt "$max_accounts" ]; then

  # New accounts should be the min(num_new_accounts, max_accounts - total_account_count)
  num_new_accounts=$(( new_accounts_per_run < (max_accounts - total_account_count) ? new_accounts_per_run : (max_accounts - total_account_count) ))
  for i in $(seq 1 $num_new_accounts); do
    new_account=$(aztec-wallet create-account -a main --register-only --node-url $NODE_URL --json | grep -Pzo '(?s)\{.*\}')
    new_account=$(echo "$new_account" | jq '. + {"inited": false}')

    echo "$new_account" | jq '.'

    aztec-wallet bridge-fee-juice 99900000000000000000 main --mint --node-url $NODE_URL --l1-rpc-urls http://35.233.242.32:8545 --l1-chain-id 1337

    # waits two blocks for l2 message to become available
    sleep 1.5m
    aztec-wallet $([ $i -eq 1 ] && echo "-p native" || echo "") deploy-account -f main --payment method=fee_juice,claim --node-url $NODE_URL

    new_accounts=$(echo "$new_accounts" | jq --argjson acc "$new_account" '. += [$acc]')
  done
fi

# Test account deployment with sponsoredfpc
DEVNET_FPC_ADDRESS="0xdeadbeef"
SPONSORED_FPC_PAYMENT_METHOD="--payment method=fpc-sponsored,fpc=$DEVNET_FPC_ADDRESS"
aztec-wallet create-account --node-url $NODE_URL $SPONSORED_FPC_PAYMENT_METHOD

echo "$new_accounts" | jq '.'

jq --argjson new_accounts "$new_accounts" '.accounts += $new_accounts' state.json > tmp.json && mv tmp.json state.json
