should_prove_mint=true
should_prove_transfer=true
use_sponsored_fpc=true

# We loop through every account and do required setup, and test that the suite of function calls work as expected.
# The specific calls tested are mint_to_private, and mint_to_public in setup; and for each token we transfer
# to the other accounts in aggregate 1/8 of our balance in both private and public.

jq -c '.accounts[]' state.json | while read -r account; do
  current_user_address=$(echo $account | jq -r '.address')
  account_needs_setup=$(echo "$account" | jq -r '.needs_setup')

  # We should use the sponsored fpc flow for one account at least, this flag is true at the start
  # but set false after the first account has been processed
  fee_method_override=$(get_fee_method "$use_sponsored_fpc")

  # Register all Token contracts for each account
  jq -c '.contracts | map(select(.type=="token"))[]' state.json | while read -r contract; do
    token_address=$(echo "$contract" | jq -r '.address')

    echo "Processing token contract at $token_address"
    aztec-wallet \
      register-contract "$token_address" Token \
      -f "$current_user_address"

  done

  AMOUNT=420000000000

  # If the account, or Token is new, we need to mint to the account being processed.
  jq -c '.contracts | map(select(.type=="token"))[]' state.json | while read -r contract; do
    token_needs_setup=$(echo "$contract" | jq -r '.needs_setup')

    if [[ "$account_needs_setup" = "true" || "$token_needs_setup" = "true" ]]; then
      token_address=$(echo "$contract" | jq -r '.address')
      admin_and_minter=$(echo "$contract" | jq -r '.admin_and_minter')

      echo "Minting for $current_user_address from token $token_address"
      echo "Minting to public balance for $current_user_address"

      prover_to_use_for_minting=$(get_prover "$should_prove_mint")

      aztec-wallet $prover_to_use_for_minting send mint_to_public \
        -ca $token_address \
        --args $current_user_address $AMOUNT \
        -f $admin_and_minter \
        $fee_method_override

      aztec-wallet $prover_to_use_for_minting send mint_to_private \
        -ca $token_address \
        --args $admin_and_minter $current_user_address $AMOUNT \
        -f $admin_and_minter \
        $fee_method_override

      public_balance=$(get_public_balance "$token_address" "$current_user_address" "$current_user_address")

      private_balance=$(get_private_balance "$token_address" "$current_user_address")

      echo "Balances for account $current_user_address at address $token_address"
      echo "Private balance: $private_balance"
      echo "public balance: $public_balance"

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

  jq -c '.contracts | map(select(.type=="token"))[]' state.json | while read -r contract; do
    token_address=$(echo "$contract" | jq -r '.address')

    public_balance=$(get_public_balance "$token_address" "$current_user_address" "$current_user_address")

    private_balance=$(get_private_balance "$token_address" "$current_user_address")

    echo "Account $current_user_address for token address $token_address public balance is ${public_balance}"
    echo "Account $current_user_address for token address $token_address private balance is ${private_balance}"

    # We distribute 1/8 of our private and public balances the other accounts
    amount_to_transfer=$(($public_balance/8/$other_accounts_count))
    echo "Amount to transfer $amount_to_transfer"

    echo "$other_accounts" | while read -r other_account; do
      other_address=$(echo "$other_account" | jq -r '.address')

      echo "Token address: $token_address, Current address: $current_user_address, Other address: $other_address"

      prover_to_use_for_transfer=$(get_prover "$should_prove_transfer")

      aztec-wallet $prover_to_use_for_transfer \
        send transfer_in_public \
        -ca $token_address \
        --args $current_user_address $other_address $amount_to_transfer 0 \
        -f $current_user_address \
        $fee_method_override

      aztec-wallet $prover_to_use_for_transfer \
        send transfer_in_private \
        -ca $token_address \
        --args $current_user_address $other_address $amount_to_transfer 0 \
        -f $current_user_address \
        $fee_method_override

      should_prove_transfer=false
    done
  done
  use_sponsored_fpc=false
done
