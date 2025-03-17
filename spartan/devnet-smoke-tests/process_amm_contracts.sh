# Process accounts for AMM
process_proven=false
use_sponsored_fpc=true

jq -c '.accounts[]' state.json | while read -r account; do
  current_user_address=$(echo $account | jq -r '.address')
  account_inited=$(echo "$account" | jq -r '.inited')

  # Register all AMM related contracts for each account
  jq -c '.contracts | map(select(.type=="amm"))[]' state.json | while read -r contract; do
    token_0_address=$(echo "$contract" | jq -r '.token_0_address')
    token_1_address=$(echo "$contract" | jq -r '.token_1_address')
    token_liquidity_address=$(echo "$contract" | jq -r '.token_liquidity_address')
    amm_address=$(echo "$contract" | jq -r '.amm_address')

    aztec-wallet register-contract "$token_0_address" Token -f "$current_user_address" --node-url $NODE_URL
    aztec-wallet register-contract "$token_1_address" Token -f "$current_user_address" --node-url $NODE_URL
    aztec-wallet register-contract "$token_liquidity_address" Token -f "$current_user_address" --node-url $NODE_URL
    aztec-wallet register-contract "$amm_address" AMM -f "$current_user_address" --node-url $NODE_URL

    aztec-wallet register-contract "$token_0_address" Token -f accounts:test0 --node-url $NODE_URL
    aztec-wallet register-contract "$token_1_address" Token -f accounts:test0 --node-url $NODE_URL
    aztec-wallet register-contract "$token_liquidity_address" Token -f accounts:test0 --node-url $NODE_URL
    aztec-wallet register-contract "$amm_address" AMM -f accounts:test0 --node-url $NODE_URL
  done

  AMOUNT=420000000000

  # Do setup for each amm if new account or new amm setup
  jq -c '.contracts | map(select(.type=="amm"))[]' state.json | while read -r contract; do
    amm_inited=$(echo "$contract" | jq -r '.inited')

    if [ "$account_inited" = "false" ] || [ "$amm_inited" = "false" ]; then
      token_0_address=$(echo "$contracts_data" | jq -r '.token_0_address')
      token_1_address=$(echo "$contracts_data" | jq -r '.token_1_address')
      token_liquidity_address=$(echo "$contracts_data" | jq -r '.token_liquidity_address')
      amm_address=$(echo "$contracts_data" | jq -r '.amm_address')

      aztec-wallet send mint_to_private -ca "$token_0_address" --args test0 "$current_user_address" "$AMOUNT" -f test0 --node-url $NODE_URL $([ "$use_sponsored_fpc" = "true" ] && echo "$SPONSORED_FPC_PAYMENT_METHOD" || echo "")
      aztec-wallet send mint_to_private -ca "$token_1_address" --args test0 "$current_user_address" "$AMOUNT" -f test0 --node-url $NODE_URL $([ "$use_sponsored_fpc" = "true" ] && echo "$SPONSORED_FPC_PAYMENT_METHOD" || echo "")

      private_balance_token_0=$(aztec-wallet simulate balance_of_private -ca "$token_0_address" --args "$current_user_address" -f "$current_user_address" --node-url $NODE_URL | grep "Simulation result:" | awk '{print $3}')
      private_balance_token_1=$(aztec-wallet simulate balance_of_private -ca "$token_1_address" --args "$current_user_address" -f "$current_user_address" --node-url $NODE_URL | grep "Simulation result:" | awk '{print $3}')

      echo "Account $current_user_address for token 0 address $token_0_address private balance is ${private_balance_token_0}"
      echo "Account $current_user_address for token 1 address $token_1_address private balance is ${private_balance_token_1}"
    else
      echo "Skipping setup for $current_user_address from amm $amm_address - already initialized"
    fi
  done

  # Then for each amm contract, we do a flow of adding liquidity, swapping, and removing liquidity
  jq -c '.contracts | map(select(.type=="amm"))[]' state.json | while read -r contracts_data; do
    token_0_address=$(echo "$contracts_data" | jq -r '.token_0_address')
    token_1_address=$(echo "$contracts_data" | jq -r '.token_1_address')
    token_liquidity_address=$(echo "$contracts_data" | jq -r '.token_liquidity_address')
    amm_address=$(echo "$contracts_data" | jq -r '.amm_address')

    private_balance_token_0=$(aztec-wallet simulate balance_of_private -ca "$token_address" --args $current_user_address -f $current_user_address --node-url $NODE_URL | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')
    private_balance_token_1=$(aztec-wallet simulate balance_of_private -ca "$token_address" --args $current_user_address -f $current_user_address --node-url $NODE_URL | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')

    echo "Account $current_user_address for token 0 address $token_0_address private balance is ${private_balance_token_0}"
    echo "Account $current_user_address for token 1 address $token_1_address private balance is ${private_balance_token_1}"

    aztec-wallet create-secret -a add-liquidity-nonce
    aztec-wallet create-authwit transfer_to_public "$amm_address" -ca "$token_0_address" --args "$current_user_address" "$amm_address" "$amount_0_max" secrets:add-liquidity-nonce -f "$current_user_address" -a amm-lp-token-0
    aztec-wallet create-authwit transfer_to_public "$amm_address" -ca "$token_1_address" --args "$current_user_address" "$amm_address" "$amount_1_max" secrets:add-liquidity-nonce -f "$current_user_address" -a amm-lp-token-1

    amount_0_max=$((private_balance_token_0/4))
    amount_1_max=$((private_balance_token_1/4))
    amount_0_min=1
    amount_1_min=1

    aztec-wallet $([ "$process_proven" = "false" ] && echo "-p native" || echo "") send add_liquidity -ca "$amm_address" --args "$amount_0_max" "$amount_1_max" "$amount_0_min" "$amount_1_min" secrets:add-liquidity-nonce -aw amm-lp-token-0 -aw amm-lp-token-1 -f "$liquidity_provider" $([ "$use_sponsored_fpc" = "true" ] && echo "$SPONSORED_FPC_PAYMENT_METHOD" || echo "")

    ###

    amount_in=$((private_balance_token_0/88))

    aztec-wallet create-secret -a swap-nonce
    aztec-wallet create-authwit transfer_to_public "$amm_address" -ca "$token_0_address" --args "$current_user_address" "$amm_address" "$amount_in" secrets:swap-nonce -f "$current_user_address" -a amm-swapper-token-0

    amount_out_min=$(aztec-wallet simulate get_amount_out_for_exact_in -ca "$amm_address" --args "$balance_of_public_token_0_amm" "$balance_of_public_token_1_amm" "$amount_in" -f "$swapper")
    echo "Amount out min for swap: $amount_out_min"

    # TODO: test swap_tokens_for_exact_tokens ?
    aztec-wallet $([ "$process_proven" = "false" ] && echo "-p native" || echo "") send swap_exact_tokens_for_tokens --ca "$amm_address" --args "$token_0_address" "$token_1_address" "$amount_in" 0 secrets:swap-nonce -aw amm-swapper-token-0 -f "$current_user_address" $([ "$use_sponsored_fpc" = "true" ] && echo "$SPONSORED_FPC_PAYMENT_METHOD" || echo "")

    liquidity_token_balance=$(aztec-wallet simulate balance_of_private -ca "$token_liquidity_address" --args "$other_liquidity_provider" -f "$other_liquidity_provider" --node-url $NODE_URL | grep "Simulation result:" | awk '{print $3}')
    echo "Liquidity token balance: $liquidity_token_balance"

    aztec-wallet create-secret -a burn-nonce
    aztec-wallet create-authwit transfer_to_public "$amm_address" -ca "$token_liquidity_address" --args "$current_user_address" "$amm_address" "$liquidity_token_balance" secrets:burn-nonce -f "$current_user_address" -a amm-burn-token-liquidity

    amount_0_min=1
    amount_1_min=1

    aztec-wallet $([ "$process_proven" = "false" ] && echo "-p native" || echo "") send remove_liquidity --ca "$amm_address" --args $((liquidity_token_balance/8)) "$amount_0_min" "$amount_1_min" secrets:burn-nonce -aw amm-burn-token-liquidity -f "$current_user_address" $([ "$use_sponsored_fpc" = "true" ] && echo "$SPONSORED_FPC_PAYMENT_METHOD" || echo "")

    process_proven=true
  done
  use_sponsored_fpc=false
done
