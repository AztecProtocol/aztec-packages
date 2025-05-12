should_prove_mint=true
should_prove_transfer=true
use_sponsored_fpc=true

# We loop through every account and do required setup, and test that the suite of function calls work as expected.
# The specific calls tested are mint and transfer_to_private in setup; and for each NFT contract we try to transfer at most 2 nfts, sending
# each to a randomly selected account.

jq -c '.accounts[]' state.json | while read -r account; do
  current_user_address=$(echo "$account" | jq -r '.address')
  account_needs_setup=$(echo "$account" | jq -r '.needs_setup')

  # We should use the sponsored fpc flow for one account at least, this flag is true at the start
  # but set false after the first account has been processed
  fee_method_override=$(get_fee_method "$use_sponsored_fpc")

  # Register all NFT contracts for each account
  jq -c '.contracts | map(select(.type=="nft"))[]' state.json | while read -r contract; do
    nft_address=$(echo "$contract" | jq -r '.address')

    echo "Processing nft contract at $nft_address"
    aztec-wallet \
      register-contract $nft_address NFT \
      -f $current_user_address

  done

  nfts_to_mint=2

  # If the account, or amm is new, we need to mint to the account being processed.
  jq -c '.contracts | map(select(.type=="nft"))[]' state.json | while read -r contract; do
    nft_needs_setup=$(echo "$contract" | jq -r '.needs_setup')

    if [ "$account_needs_setup" = "true" ] || [ "$nft_needs_setup" = "true" ]; then
        nft_address=$(echo "$contract" | jq -r '.address')
        token_id=$(echo "$contract" | jq -r '.token_id')
        admin_and_minter=$(echo "$contract" | jq -r '.admin_and_minter')

        for i in $(seq 1 $((nfts_to_mint))); do
          prover_to_use_for_minting_setup=$(get_prover "$should_prove_mint")

          aztec-wallet $prover_to_use_for_minting_setup \
            send mint \
            -ca $nft_address \
            --args $current_user_address $((i + token_id)) \
            -f $admin_and_minter \
            $fee_method_override

          owner_of_token_id=$(aztec-wallet \
            simulate owner_of \
            -ca $nft_address \
            --args $((i + token_id)) \
            -f $current_user_address \
            | get_simulation_result)

          echo "Owner of token_id $((i + token_id)) is $owner_of_token_id"

          # Transfer our nfts to private due to easier tracking
          aztec-wallet $prover_to_use_for_minting_setup \
            send transfer_to_private \
            -ca $nft_address \
            --args $current_user_address $((i + token_id)) \
            -f $current_user_address \
            $fee_method_override

          private_nfts=$(aztec-wallet \
            simulate get_private_nfts \
            -ca $nft_address \
            --args $current_user_address 0 \
            -f $current_user_address)

          echo "Private Nfts: $private_nfts"

          should_prove_mint=false
        done

        # Increment token id by nfts_to_mint
        jq --arg addr "$nft_address" --arg increment "$nfts_to_mint" '
          .contracts |= map(
            select(.type == "nft" and .address == $addr) |= (.token_id += ($increment | tonumber)) // .
          )
        ' state.json > temp.json && mv temp.json state.json
    else
      echo "Skipping minting for $current_user_address from nft $nft_address - already initialized"
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

  # For each contract, we send nfts_to_send to a random recipient
  nfts_to_send=2
  jq -c '.contracts | map(select(.type=="nft"))[]' state.json | while read -r contract; do
    nft_address=$(echo "$contract" | jq -r '.address')

    private_nfts=$(aztec-wallet \
      simulate get_private_nfts \
      -ca $nft_address \
      --args $current_user_address 0 \
      -f $current_user_address)

    processed_nfts=$(echo "$private_nfts" | grep -o '[0-9]\+n' | sed 's/n$//' | grep -v '^0$')

    nft_array=$(echo "$processed_nfts" | jq -R -s 'split("\n") | map(select(length > 0))')
    nft_count=$(echo "$nft_array" | jq '. | length')

    # We take the minimum of nfts_to_send, and nft_count
    for i in $(seq 0 $((nfts_to_send - 1 < $nft_count - 1 ? nfts_to_send - 1 : $nft_count - 1))); do
      # Get the current NFT
      current_nft=$(echo "$nft_array" | jq -r ".[$i]")

      if [[ -z "$current_nft" || "$current_nft" == "null" ]]; then
        continue
      fi

      random_other_account_address=$(select_random_account "$other_accounts")

      prover_to_use_for_transfer=$(get_prover "$should_prove_transfer")

      aztec-wallet $prover_to_use_for_transfer \
        send transfer_in_private \
        -ca $nft_address \
        --args $current_user_address $random_other_account_address $current_nft 0 \
        -f $current_user_address \
        $fee_method_override

      should_prove_transfer=false
    done
  done
  use_sponsored_fpc=false
done
