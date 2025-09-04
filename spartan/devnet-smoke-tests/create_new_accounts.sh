new_accounts_per_run=2
new_accounts="[]"
max_accounts=2

total_account_count=$(jq '.accounts | length' state.json)
if [ "$total_account_count" -lt "$max_accounts" ]; then

  # New accounts should be the min(num_new_accounts, max_accounts - total_account_count)
  num_new_accounts=$(( new_accounts_per_run < (max_accounts - total_account_count) ? new_accounts_per_run : (max_accounts - total_account_count) ))
  for i in $(seq 1 $num_new_accounts); do
    new_account=$(aztec-wallet \
      create-account \
      -a main \
      --register-only \
      --json \
      | grep -Pzo '(?s)\{.*\}')

    new_account=$(echo "$new_account" | jq '. + {"needs_setup": true}')

    echo "$new_account" | jq '.'

    # We assume we are an end user without access to the prefunded L1 account. Thus we have to
    # create an L1 account, drip eth to it, then use this account to bridge fee juice.
    l1_account=$(aztec \
      create-l1-account \
      --json)

    l1_private_key=$(echo "$l1_account" | jq -r '.privateKey')
    l1_address=$(echo "$l1_account" | jq -r '.address')

    aztec \
      drip-faucet \
      -t ETH \
      -a $l1_address \
      -u $FAUCET_URL

    aztec-wallet \
      bridge-fee-juice 1000000000000000000 accounts:main \
      --mint \
      --l1-rpc-urls $L1_URL \
      --l1-chain-id 1337 \
      --l1-private-key $l1_private_key

    # We sleep here because it seems that the wait option on bridging is a bit flaky and sometimes we need to
    # wait another block (slot duration is 36s and picked 40s due to it being a nice round number)
    echo "Sleeping 40 seconds before deploying to wait for L1 -> L2 message existence"
    sleep 40s

    # We only use the prover on the first iteration of the loop to avoid duplicating identical proofs
    prover_to_use=$(get_prover $((i == 1)))

    aztec-wallet $prover_to_use \
     deploy-account \
     -f accounts:main \
     --payment method=fee_juice,claim

    new_accounts=$(echo "$new_accounts" | jq --argjson acc "$new_account" '. += [$acc]')
  done
fi

echo "$new_accounts" | jq '.'

add_to_state ".accounts" "$new_accounts"

# Test account deployment works with sponsoredFPC, we don't actually save this account though because we would like
# the persistent accounts that we use to have a healthy balance of fee juice
aztec-wallet \
  create-account \
  -a sponsored-fpc \
  --register-only

aztec-wallet \
  register-contract $SPONSORED_FPC_ADDRESS SponsoredFPC \
  -f accounts:sponsored-fpc \
  --salt 0

prover_to_use="-p native"
aztec-wallet $prover_to_use \
  deploy-account \
  -f accounts:sponsored-fpc \
  $SPONSORED_FPC_PAYMENT_METHOD
