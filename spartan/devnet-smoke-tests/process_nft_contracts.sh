# Process accounts for NFT
setup_proven=false
process_proven=false
use_sponsored_fpc=true

jq -c '.accounts[]' state.json | while read -r account; do
  current_user_address=$(echo $account | jq -r '.address')
  account_inited=$(echo "$account" | jq -r '.inited')

  # For each account we have to make sure that it has registered every nft contract
  jq -c '.contracts | map(select(.type=="nft"))[]' state.json | while read -r contract; do
    nft_address=$(echo "$contract" | jq -r '.address')

    echo "Processing nft contract at $nft_address"
    aztec-wallet register-contract "$nft_address" NFT -f "$current_user_address" --node-url $NODE_URL
    aztec-wallet register-contract "$nft_address" NFT -f accounts:test0 --node-url $NODE_URL
  done

  nfts_to_mint=2

  # Do setup for each nft if new account or new nft
  jq -c '.contracts | map(select(.type=="nft"))[]' state.json | while read -r contract; do
    nft_inited=$(echo "$contract" | jq -r '.inited')

    if [ "$account_inited" = "false" ] || [ "$nft_inited" = "false" ]; then
        nft_address=$(echo "$contract" | jq -r '.address')
        token_id=$(echo "$contract" | jq -r '.token_id')

        for i in $(seq 1 $((nfts_to_mint))); do
          aztec-wallet $([ "$setup_proven" = "false" ] && echo "-p native" || echo "") send mint -ca "$nft_address" --args "$current_user_address" $((i + token_id)) -f test0 --node-url $NODE_URL $([ "$use_sponsored_fpc" = "true" ] && echo "$SPONSORED_FPC_PAYMENT_METHOD" || echo "")

          owner_of_token_id=$(aztec-wallet simulate owner_of -ca "$nft_address" --args $((i + token_id)) -f "$current_user_address" --node-url $NODE_URL | grep "Simulation result:" | awk '{print $3}')
          echo "Owner of token_id $((i + token_id)) is $owner_of_token_id"

          # Transfer our nfts to private due to easier tracking
          aztec-wallet $([ "$setup_proven" = "false" ] && echo "-p native" || echo "") send transfer_to_private -ca "$nft_address" --args "$current_user_address" $((i + token_id)) -f "$current_user_address" --node-url $NODE_URL $([ "$use_sponsored_fpc" = "true" ] && echo "$SPONSORED_FPC_PAYMENT_METHOD" || echo "")

          private_nfts=$(aztec-wallet simulate get_private_nfts -ca "$nft_address" --args "$current_user_address" 0 -f "$current_user_address" --node-url $NODE_URL | grep "Simulation result:" | awk '{print $3}')
          echo "Private Nfts: $private_nfts"

          setup_proven=true
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

  other_accounts=$(jq -c --arg curr "$current_user_address" '[.accounts[] | select(.address != $curr)]' state.json)

  other_accounts_count=$(echo "$other_accounts" | jq -s 'length')
  if [ "$other_accounts_count" -eq 0 ]; then
      echo "No other accounts found, exiting..."
      break
  fi

  # For each contract, we send nfts_to_send to a random recipient
  nfts_to_send=2
  jq -c '.contracts | map(select(.type=="nft"))[]' state.json | while read -r contract; do
    nft_address=$(echo "$contract" | jq -r '.address')

    private_nfts=$(aztec-wallet simulate get_private_nfts -ca "$nft_address" --args "$current_user_address" 0 -f "$current_user_address" --node-url $NODE_URL | grep "Simulation result:" | awk '{print $3}')
    nft_array=$(echo "$private_nfts" | jq -c -R 'split(" ") | map(select(length > 0))')
    nft_count=$(echo "$nft_array" | jq '. | length')

    # We take the minimum of nfts_to_send, and nft_count
    for i in $(seq 0 $((nfts_to_send - 1 < $nft_count - 1 ? nfts_to_send - 1 : $nft_count - 1))); do
      # Get the current NFT
      current_nft=$(echo "$nft_array" | jq -r ".[$i]")

      if [[ -z "$current_nft" || "$current_nft" == "null" ]]; then
        continue
      fi

      random_index=$((RANDOM % account_count))
      random_account="${account_array[$random_index]}"
      random_account_address=$(echo "$random_account" | jq -r '.address')

      aztec-wallet $([ "$process_proven" = "false" ] && echo "-p native" || echo "") send transfer_in_private -ca "$nft_address" --args "$current_account" "$random_account_address" "$current_nft" 0 -f "$current_user_address" --node-url $NODE_URL $([ "$use_sponsored_fpc" = "true" ] && echo "$SPONSORED_FPC_PAYMENT_METHOD" || echo "")

      process_proven=true
    done
  done
  use_sponsored_fpc=false
done
