should_prove_flow=true
use_sponsored_fpc=true

# We loop through every account and do required setup, and test that the suite of function calls work as expected.
# The specific calls tested are mint_to_private in setup; and for each amm setup, we add liquidity, swap, then remove liquidity.

jq -c '.accounts[]' state.json | while read -r account; do
  current_user_address=$(echo "$account" | jq -r '.address')
  account_needs_setup=$(echo "$account" | jq -r '.needs_setup')

  # We should use the sponsored fpc flow for one account at least, this flag is true at the start
  # but set false after the first account has been processed
  fee_method_override=$(get_fee_method "$use_sponsored_fpc")

  # Register all AMM related contracts for each account
  jq -c '.contracts | map(select(.type=="amm"))[]' state.json | while read -r contract; do
    token_0_address=$(echo "$contract" | jq -r '.token_0_address')
    token_1_address=$(echo "$contract" | jq -r '.token_1_address')
    token_liquidity_address=$(echo "$contract" | jq -r '.token_liquidity_address')
    amm_address=$(echo "$contract" | jq -r '.amm_address')

    aztec-wallet register-contract $token_0_address Token \
      -f $current_user_address

    aztec-wallet register-contract $token_1_address Token \
      -f $current_user_address

    aztec-wallet register-contract $token_liquidity_address Token \
      -f $current_user_address

    aztec-wallet register-contract $amm_address AMM \
      -f $current_user_address

  done

  AMOUNT=420000000000

  jq -c '.contracts | map(select(.type=="amm"))[]' state.json | while read -r contracts_data; do
    amm_needs_setup=$(echo "$contracts_data" | jq -r '.needs_setup')

    # If the account, or amm is new, we need to mint to the account being processed.
    if [ "$account_needs_setup" = "true" ] || [ "$amm_needs_setup" = "true" ]; then
      token_0_address=$(echo "$contracts_data" | jq -r '.token_0_address')
      token_1_address=$(echo "$contracts_data" | jq -r '.token_1_address')
      token_liquidity_address=$(echo "$contracts_data" | jq -r '.token_liquidity_address')
      amm_address=$(echo "$contracts_data" | jq -r '.amm_address')
      admin_and_minter=$(echo "$contracts_data" | jq -r '.admin_and_minter')

      # We don't want to prove any mint_to_privates because we already have done so in the token tests
      aztec-wallet -p none \
        send mint_to_private \
        -ca $token_0_address \
        --args $current_user_address $AMOUNT \
        -f $admin_and_minter \
        $fee_method_override

      aztec-wallet -p none \
        send mint_to_private \
        -ca $token_1_address \
        --args $current_user_address $AMOUNT \
        -f $admin_and_minter \
        $fee_method_override

      private_balance_token_0=$(get_private_balance "$token_0_address" "$current_user_address")

      private_balance_token_1=$(get_private_balance "$token_1_address" "$current_user_address")

      assert_eq "${AMOUNT}" "${private_balance_token_0}"
      assert_eq "${AMOUNT}" "${private_balance_token_1}"
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

    # Getting initial balances

    amm_public_balance_token_0_initial=$(get_public_balance "$token_0_address" "$amm_address" "$current_user_address")
    amm_public_balance_token_1_initial=$(get_public_balance "$token_1_address" "$amm_address" "$current_user_address")
    current_user_private_balance_token_0_initial=$(get_private_balance "$token_0_address" "$current_user_address")
    current_user_private_balance_token_1_initial=$(get_private_balance "$token_1_address" "$current_user_address")
    current_user_liquidity_token_balance_initial=$(get_private_balance "$token_liquidity_address" "$current_user_address")

    echo "Balances for account $current_user_address"
    echo "Token 0 at at address $token_0_address: private balance is $current_user_private_balance_token_0_initial"
    echo "Token 1 at address $token_1_address: private balance is $current_user_private_balance_token_1_initial"
    echo "Liquidity token at address $token_liquidity_address: private balance is $current_user_liquidity_token_balance_initial"

    # Adding liquidity

    amount_0_max=$((current_user_private_balance_token_0_initial/4))
    amount_1_max=$((current_user_private_balance_token_1_initial/4))
    amount_0_min=1
    amount_1_min=1

    aztec-wallet \
      create-secret \
      -a add-liquidity-nonce

    aztec-wallet \
      create-authwit transfer_to_public_and_prepare_private_balance_increase $amm_address \
      -ca $token_0_address \
      --args $current_user_address $amm_address $amount_0_max secrets:add-liquidity-nonce \
      -f $current_user_address \
      -a add_liquidity_token_0

    aztec-wallet \
      create-authwit transfer_to_public_and_prepare_private_balance_increase $amm_address \
      -ca $token_1_address \
      --args $current_user_address $amm_address $amount_1_max secrets:add-liquidity-nonce \
      -f $current_user_address \
      -a add_liquidity_token_1

    prover_to_use_for_amm_flow=$(get_prover "$should_prove_flow")

    aztec-wallet $prover_to_use_for_amm_flow \
      send add_liquidity \
      -ca $amm_address \
      --args $amount_0_max $amount_1_max $amount_0_min $amount_1_min secrets:add-liquidity-nonce \
      -aw authwits:add_liquidity_token_0,authwits:add_liquidity_token_1 \
      -f $current_user_address \
      $fee_method_override

    current_user_private_balance_token_0_after_adding_liquidity=$(get_private_balance "$token_0_address" "$current_user_address")
    current_user_private_balance_token_1_after_adding_liquidity=$(get_private_balance "$token_1_address" "$current_user_address")

    echo "Balances for account $current_user_address after adding liquidity"
    echo "Token 0 at at address $token_0_address: private balance is $current_user_private_balance_token_0_after_adding_liquidity"
    echo "Token 1 at address $token_1_address: private balance is $current_user_private_balance_token_1_after_adding_liquidity"

    # We check that both tokens balance has decreased after adding liquidity
    assert_lt "$current_user_private_balance_token_0_after_adding_liquidity" "$current_user_private_balance_token_0_initial"
    assert_lt "$current_user_private_balance_token_1_after_adding_liquidity" "$current_user_private_balance_token_1_initial"

    amm_public_balance_token_0_after_adding_liquidity=$(get_public_balance "$token_0_address" "$amm_address" "$current_user_address")
    amm_public_balance_token_1_after_adding_liquidity=$(get_public_balance "$token_1_address" "$amm_address" "$current_user_address")

    echo "Balances for AMM $amm_address after adding liquidity"
    echo "Token 0 at at address $token_0_address: public balance is $amm_public_balance_token_0_after_adding_liquidity"
    echo "Token 1 at address $token_1_address: public balance is $amm_public_balance_token_1_after_adding_liquidity"

    # We check that our public balances for the AMM have increased by the same amount as our private balances have decreased for the account
    assert_eq $((amm_public_balance_token_0_after_adding_liquidity - amm_public_balance_token_0_initial)) $((current_user_private_balance_token_0_initial - current_user_private_balance_token_0_after_adding_liquidity))
    assert_eq $((amm_public_balance_token_1_after_adding_liquidity - amm_public_balance_token_1_initial)) $((current_user_private_balance_token_1_initial - current_user_private_balance_token_1_after_adding_liquidity))

    current_user_liquidity_token_balance_after_adding_liquidity=$(get_private_balance "$token_liquidity_address" "$current_user_address")

    assert_lt "$current_user_liquidity_token_balance_initial" "$current_user_liquidity_token_balance_after_adding_liquidity"

    # Swapping

    # The amount we want to swap should be a small fraction of our total amount
    amount_in=$((current_user_private_balance_token_0_after_adding_liquidity / 88))

    aztec-wallet \
      create-secret \
      -a swap-nonce

    aztec-wallet \
      create-authwit transfer_to_public $amm_address \
      -ca $token_0_address \
      --args $current_user_address $amm_address $amount_in secrets:swap-nonce \
      -f $current_user_address \
      -a swap_token_0

    amount_out_exact=$(aztec-wallet \
      simulate get_amount_out_for_exact_in \
      -ca $amm_address \
      --args $amm_public_balance_token_0_after_adding_liquidity $amm_public_balance_token_1_after_adding_liquidity $amount_in \
      -f $current_user_address \
      | get_simulation_result)

    echo "Amount out min for swap: $amount_out_exact"

    aztec-wallet $prover_to_use_for_amm_flow \
      send swap_exact_tokens_for_tokens \
      -ca $amm_address \
      --args $token_0_address $token_1_address $amount_in $((amount_out_exact / 2)) secrets:swap-nonce \
      -aw authwits:swap_token_0 \
      -f $current_user_address \
      $fee_method_override

    current_user_private_balance_token_0_after_swap=$(get_private_balance "$token_0_address" "$current_user_address")
    current_user_private_balance_token_1_after_swap=$(get_private_balance "$token_1_address" "$current_user_address")

    amm_public_balance_token_0_after_swap=$(get_public_balance "$token_0_address" "$amm_address" "$current_user_address")
    amm_public_balance_token_1_after_swap=$(get_public_balance "$token_1_address" "$amm_address" "$current_user_address")

    # We check that our token 0 balance after the swap is equal to the value before the swap subtracted by the amount swapped
    assert_eq $((current_user_private_balance_token_0_after_adding_liquidity - amount_in)) "$current_user_private_balance_token_0_after_swap"

    #We check that our token 1 balance after the swap is greater than before the swap
    assert_lt "$current_user_private_balance_token_1_after_adding_liquidity" "$current_user_private_balance_token_1_after_swap"

    # We check that our public balances for Token 0 the AMM have increased by the same amount as our private balances have decreased for the account, and vice versa for Token 1
    assert_eq $((amm_public_balance_token_0_after_swap - amm_public_balance_token_0_after_adding_liquidity)) $((current_user_private_balance_token_0_after_adding_liquidity - current_user_private_balance_token_0_after_swap))
    assert_eq $((amm_public_balance_token_1_after_adding_liquidity - amm_public_balance_token_1_after_swap)) $((current_user_private_balance_token_1_after_swap - current_user_private_balance_token_1_after_adding_liquidity))

    # Remove liquidity

    aztec-wallet \
      create-secret \
      -a burn-nonce

    current_user_liquidity_token_balance=$(get_private_balance "$token_liquidity_address" "$current_user_address")
    liquidity_tokens_to_remove=$((current_user_liquidity_token_balance/8))

    aztec-wallet \
      create-authwit transfer_to_public $amm_address \
      -ca $token_liquidity_address \
      --args $current_user_address $amm_address $liquidity_tokens_to_remove secrets:burn-nonce \
      -f $current_user_address \
      -a remove_liquidity

    amount_0_min=1
    amount_1_min=1

    aztec-wallet $prover_to_use_for_amm_flow \
      send remove_liquidity \
      -ca $amm_address \
      --args $liquidity_tokens_to_remove $amount_0_min $amount_1_min secrets:burn-nonce \
      -aw remove_liquidity \
      -f $current_user_address \
      $fee_method_override

    current_user_private_balance_token_0_after_removing_liquidity=$(get_private_balance "$token_0_address" "$current_user_address")
    current_user_private_balance_token_1_after_removing_liquidity=$(get_private_balance "$token_1_address" "$current_user_address")

    # We check that our token balances after removing liquidity are greater than before
    assert_lt "$current_user_private_balance_token_0_after_swap" "$current_user_private_balance_token_0_after_removing_liquidity"
    assert_lt "$current_user_private_balance_token_1_after_swap" "$current_user_private_balance_token_1_after_removing_liquidity"

    amm_public_balance_token_0_after_removing_liquidity=$(get_public_balance "$token_0_address" "$amm_address" "$current_user_address")
    amm_public_balance_token_1_after_removing_liquidity=$(get_public_balance "$token_1_address" "$amm_address" "$current_user_address")

    # We check that amm public token balances after removing liquidity are less than before
    assert_lt "$amm_public_balance_token_0_after_removing_liquidity" "$amm_public_balance_token_0_after_adding_liquidity"
    assert_lt "$amm_public_balance_token_1_after_removing_liquidity" "$amm_public_balance_token_1_after_adding_liquidity"

    # We check that our public balances for the AMM have increased by the same amount as our private balances have decreased for the account
    assert_eq $((amm_public_balance_token_0_after_swap - amm_public_balance_token_0_after_removing_liquidity)) $((current_user_private_balance_token_0_after_removing_liquidity - current_user_private_balance_token_0_after_swap))
    assert_eq $((amm_public_balance_token_1_after_swap - amm_public_balance_token_1_after_removing_liquidity)) $((current_user_private_balance_token_1_after_removing_liquidity - current_user_private_balance_token_1_after_swap))

    should_prove_flow=false
  done
  use_sponsored_fpc=false
done
