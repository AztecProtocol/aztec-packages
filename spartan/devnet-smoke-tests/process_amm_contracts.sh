# Process accounts for AMM
should_prove_flow=true
use_sponsored_fpc=true

jq -c '.accounts[]' state.json | while read -r account; do
  current_user_address=$(echo $account | jq -r '.address')
  account_inited=$(echo "$account" | jq -r '.inited')

  # We should use the sponsored fpc flow for one account at least, this flag is true at the start
  # but set false after the first account has been processed
  fee_method_override=$([ "$use_sponsored_fpc" = "true" ] && echo "$SPONSORED_FPC_PAYMENT_METHOD" || echo "")

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
      admin_and_minter=$(echo "$contract" | jq -r '.admin_and_minter')

      aztec-wallet -p none \
        send mint_to_private \
        -ca $token_0_address \
        --args $admin_and_minter $current_user_address $AMOUNT \
        -f $admin_and_minter \
        --node-url $NODE_URL \
        $fee_method_override
      aztec-wallet -p none \
        send mint_to_private \
        -ca $token_1_address \
        --args $admin_and_minter $current_user_address $AMOUNT \
        -f $admin_and_minter \
        --node-url $NODE_URL \
        $fee_method_override

      private_balance_token_0=$(aztec-wallet \
        simulate balance_of_private \
        -ca $token_0_address \
        --args $current_user_address \
        -f $current_user_address \
        --node-url $NODE_URL \
        | grep "Simulation result:" | awk '{print $3}')

      private_balance_token_1=$(aztec-wallet \
        simulate balance_of_private \
        -ca $token_1_address \
        --args $current_user_address \
        -f $current_user_address \
        --node-url $NODE_URL \
        | grep "Simulation result:" | awk '{print $3}')


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

    amm_public_balance_token_0_initial=$(aztec-wallet \
      simulate balance_of_public \
      -ca $token_0_address \
      --args $amm_address \
      -f $current_user_address \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')

    amm_public_balance_token_1_initial=$(aztec-wallet \
      simulate balance_of_public \
      -ca $token_1_address \
      --args $amm_address \
      -f $current_user_address \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')

    current_user_private_balance_token_0_initial=$(aztec-wallet \
      simulate balance_of_private \
      -ca $token_0_address \
      --args $current_user_address \
      -f $current_user_address \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')

    current_user_private_balance_token_1_initial=$(aztec-wallet \
      simulate balance_of_private \
      -ca $token_1_address \
      --args $current_user_address \
      -f $current_user_address \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')

    current_user_liquidity_token_balance_initial=$(aztec-wallet \
      simulate balance_of_private \
      -ca $token_liquidity_address \
      --args $other_liquidity_provider \
      -f $other_liquidity_provider \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}')

    echo "Account $current_user_address for token 0 address $token_0_address private balance is ${current_user_private_balance_token_0_initial}"
    echo "Account $current_user_address for token 1 address $token_1_address private balance is ${current_user_private_balance_token_1_initial}"
    echo "Account $current_user_address for token liquidity address $token_liquidity_address private blance is $liquidity_token_balance"

    aztec-wallet \
      create-secret \
      -a add-liquidity-nonce

    aztec-wallet \
      create-authwit transfer_to_public $amm_address \
      -ca $token_0_address \
      --args $current_user_address $amm_address $amount_0_max secrets:add-liquidity-nonce \
      -f $current_user_address \
      -a amm-lp-token-0

    aztec-wallet \
      create-authwit transfer_to_public $amm_address \
      -ca $token_1_address \
      --args $current_user_address $amm_address $amount_1_max secrets:add-liquidity-nonce \
      -f $current_user_address \
      -a amm-lp-token-1

    amount_0_max=$((private_balance_token_0/4))
    amount_1_max=$((private_balance_token_1/4))
    amount_0_min=1
    amount_1_min=1

    prover_to_use_for_amm_flow=$([ "$should_prove_flow" = "true" ] && echo "-p native" || echo "-p none")

    aztec-wallet $prover_to_use_for_amm_flow \
      send add_liquidity \
      -ca $amm_address \
      --args $amount_0_max $amount_1_max $amount_0_min $amount_1_min secrets:add-liquidity-nonce \
      -aw amm-lp-token-0 \
      -aw amm-lp-token-1 \
      -f "$liquidity_provider" \
      $fee_method_override

    current_user_private_balance_token_0_after_adding_liquidity=$(aztec-wallet \
      simulate balance_of_private \
      -ca "$token_address" \
      --args $current_user_address \
      -f $current_user_address \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')

    current_user_private_balance_token_1_after_adding_liquidity=$(aztec-wallet \
      simulate balance_of_private \
      -ca "$token_address" \
      --args $current_user_address \
      -f $current_user_address \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')

    echo "Account $current_user_address for token 0 address $token_0_address private balance is ${current_user_private_balance_token_0_after_adding_liquidity}"
    echo "Account $current_user_address for token 1 address $token_1_address private balance is ${current_user_private_balance_token_1_after_adding_liquidity}"

    assert($current_user_private_balance_token_0_after_adding_liquidity < $current_user_private_balance_token_0_initial && \
      $current_user_private_balance_token_1_after_adding_liquidity < $current_user_private_balance_token_1_initial)

    amm_public_balance_token_0_after_adding_liquidity=$(aztec-wallet \
      simulate balance_of_public \
      -ca $token_0_address \
      --args $current_user_address \
      -f $current_user_address \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')

    amm_public_balance_token_1_after_adding_liquidity=$(aztec-wallet \
      simulate balance_of_public \
      -ca $token_1_address \
      --args $current_user_address \
      -f $current_user_address \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')

    echo "AMM public balance for token 0 is ${amm_public_balance_token_0_after_adding_liquidity}"
    echo "AMM public balance for token 1 is ${amm_public_balance_token_1_after_adding_liquidity}"

    assert($amm_public_balance_token_0_after_adding_liquidity >= $(current_user_private_balance_token_0_initial - current_user_private_balance_token_0_after_adding_liquidity) && \
      $amm_public_balance_token_1_after_adding_liquidity >= $(current_user_private_balance_token_1_initial - current_user_private_balance_token_1_after_adding_liquidity))

    current_user_liquidity_token_balance_after_adding_liquidity=$(aztec-wallet \
      simulate balance_of_private \
      -ca $token_liquidity_address \
      --args $other_liquidity_provider \
      -f $other_liquidity_provider \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}')

    assert($(current_user_liquidity_token_balance_after_adding_liquidity > current_user_liquidity_token_balance_initial))

    ###

    amount_in=$((current_user_private_balance_token_0_after_adding_liquidity / 88))

    aztec-wallet \
      create-secret \
      -a swap-nonce

    aztec-wallet \
      create-authwit transfer_to_public $amm_address \
      -ca $token_0_address \
      --args $current_user_address $amm_address $amount_in secrets:swap-nonce \
      -f $current_user_address \
      -a amm-swapper-token-0

    amount_out_exact=$(aztec-wallet \
      simulate get_amount_out_for_exact_in \
      -ca $amm_address \
      --args $amm_public_balance_token_0_after_adding_liquidity $amm_public_balance_token_1_after_adding_liquidity $amount_in \
      -f $current_user_address)

    echo "Amount out min for swap: $amount_out_exact"

    aztec-wallet $prover_to_use_for_amm_flow \
      send swap_exact_tokens_for_tokens \
      --ca $amm_address \
      --args $token_0_address $token_1_address $amount_in $(amount_out_exact / 2) secrets:swap-nonce \
      -aw amm-swapper-token-0 \
      -f $current_user_address \
      $fee_method_override

    current_user_private_balance_token_0_after_swap=$(aztec-wallet \
      simulate balance_of_private \
      -ca "$token_address" \
      --args $current_user_address \
      -f $current_user_address \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')

    current_user_private_balance_token_1_after_swap=$(aztec-wallet \
      simulate balance_of_private \
      -ca "$token_address" \
      --args $current_user_address \
      -f $current_user_address \
      --node-url $NODE_URL \
      | grep "Simulation result:" | awk '{print $3}' | tr -d 'n')

    #assert token 0 = initial - amount in
    #assert token 1 > initial
    ###

    aztec-wallet \
      create-secret \
      -a burn-nonce

    aztec-wallet \
      create-authwit transfer_to_public $amm_address \
      -ca $token_liquidity_address \
      --args $current_user_address $amm_address $liquidity_token_balance secrets:burn-nonce \
      -f $current_user_address \
      -a amm-burn-token-liquidity

    amount_0_min=1
    amount_1_min=1

    aztec-wallet $prover_to_use_for_amm_flow \
      send remove_liquidity \
      --ca "$amm_address" \
      --args $((liquidity_token_balance/8)) $amount_0_min $amount_1_min secrets:burn-nonce \
      -aw amm-burn-token-liquidity \
      -f "$current_user_address" \
      $fee_method_override

    should_prove_flow=false
  done
  use_sponsored_fpc=false
done
