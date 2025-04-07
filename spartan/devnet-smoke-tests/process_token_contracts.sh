# Process tokens for account
should_prove_mint=true
should_prove_transfer=true
use_sponsored_fpc=true

jq -c '.accounts[]' state.json | while read -r account; do
  current_user_address=$(echo $account | jq -r '.address')
  account_inited=$(echo "$account" | jq -r '.inited')
  fee_method_override=$([ "$use_sponsored_fpc" = "true" ] && echo "$SPONSORED_FPC_PAYMENT_METHOD" || echo "")

  # For each account we have to make sure that it has registered every token contract
  jq -c '.contracts | map(select(.type=="token"))[]' state.json | while read -r contract; do
    token_address=$(echo "$contract" | jq -r '.address')

    echo "Processing token contract at $token_address"
    aztec-wallet register-contract "$token_address" Token -f "$current_user_address" --node-url $NODE_URL
  done

  AMOUNT=420000000000

  # Do setup for each token if new account or new token
  jq -c '.contracts | map(select(.type=="token"))[]' state.json | while read -r contract; do
    token_inited=$(echo "$contract" | jq -r '.inited')

    if [ "$account_inited" = "false" ] || [ "$token_inited" = "false" ]; then
      token_address=$(echo "$contract" | jq -r '.address')
      admin_and_minter=$(echo "$contract" | jq -r '.admin_and_minter')

      echo "Minting for $current_user_address from token $token_address"
      echo "Minting to public balance for $current_user_address"

      prover_to_use_for_minting=$([ "$should_prove_mint" = "true" ] && echo "-p native" || echo "-p none")

      aztec-wallet $prover_to_use_for_minting send mint_to_public \
        -ca $token_address \
        --args $current_user_address $AMOUNT \
        -f $admin_and_minter \
        --node-url $NODE_URL \
        $fee_method_override

      echo "Minting to private balance for $current_user_address"
      aztec-wallet $prover_to_use_for_minting send mint_to_private \
        -ca $token_address \
        --args $admin_and_minter $current_user_address $AMOUNT \
        -f $admin_and_minter \
        --node-url $NODE_URL \
        $fee_method_override

      public_balance=$(aztec-wallet simulate balance_of_public \
        -ca $token_address \
        --args $current_user_address \
        -f $current_user_address \
        --node-url $NODE_URL \
        | grep "Simulation result:" | awk '{print $3}')

      private_balance=$(aztec-wallet simulate balance_of_private \
        -ca $token_address \
        --args $current_user_address \
        -f $current_user_address \
        --node-url $NODE_URL \
        | grep "Simulation result:" | awk '{print $3}')

      echo "Account $current_user_address for token address $token_address public balance is ${public_balance}"
      echo "Account $current_user_address for token address $token_address private balance is ${private_balance}"

      should_prove_mint=false
    else
      echo "Skipping minting for $current_user_address from token $token_address - already initialized"
    fi
  done

  other_accounts=$(jq -c \
    --arg curr "$current_user_address" \
    '.accounts[] | select(.address != $curr)' state.json)

  other_accounts_count=$(echo "$other_accounts" | jq -s 'length')
  if [ "$other_accounts_count" -eq 0 ]; then
    echo "No other accounts found, exiting..."
    break
  fi

  # We then process each contract
  jq -c '.contracts | map(select(.type=="token"))[]' state.json | while read -r contract; do
    token_address=$(echo "$contract" | jq -r '.address')

    public_balance=$(aztec-wallet simulate balance_of_public \
      -ca $token_address \
      --args $current_user_address \
      -f $current_user_address \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')

    private_balance=$(aztec-wallet simulate balance_of_private \
      -ca $token_address \
      --args $current_user_address \
      -f $current_user_address \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')

    echo "Account $current_user_address for token address $token_address public balance is ${public_balance}"
    echo "Account $current_user_address for token address $token_address private balance is ${private_balance}"

    # For every other account, we distribute 1/2 of our private and public balances to them
    amount_to_transfer=$(($public_balance/2/$other_accounts_count))
    echo "Amount to transfer $amount_to_transfer"

    echo "$other_accounts" | while read -r other_account; do
      other_address=$(echo "$other_account" | jq -r '.address')

      echo "Token address: $token_address, Current address: $current_user_address, Other address: $other_address"

      prover_to_use_for_transfer=$([ "$should_prove_transfer" = "true" ] && echo "-p native" || echo "-p none")

      aztec-wallet $prover_to_user_for_transfer \
        send transfer_in_public \
        -ca "$token_address" \
        --args "$current_user_address" "$other_address" $amount_to_transfer 0 \
        -f "$current_user_address" \
        --node-url $NODE_URL \
        $fee_method_override

      aztec-wallet $prover_to_user_for_transfer \
        send transfer_in_private \
        -ca "$token_address" \
        --args "$current_user_address" "$other_address" $amount_to_transfer 0 \
        -f "$current_user_address" \
        --node-url $NODE_URL \
        $fee_method_override

      should_prove_transfer=false
    done
  done
  use_sponsored_fpc=false
done
