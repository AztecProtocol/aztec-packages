nft_contract_count=$(jq '.contracts | map(select(.type=="nft")) | length' state.json)
max_nft_contracts=1
nft_contracts_per_run=1
accounts=$(jq -c '.accounts[]' state.json)

# Check the current nft contract count and create more if current < max_nft_contract
if [ "$nft_contract_count" -lt "$max_nft_contracts" ]; then
  new_nft_contracts="[]"

  num_new_nft_contracts=$(( nft_contracts_per_run < (max_nft_contracts - nft_contract_count) ? nft_contracts_per_run : (max_nft_contracts - nft_contract_count) ))
  for i in $(seq 1 $num_new_nft_contracts); do
    admin_and_minter_address=$(select_random_account "$accounts")

    nft_symbol="NFB_$((nft_contract_count + i))}"
    nft_name="NonFungibullish_$((nft_contract_count + i))"

    # We only use the prover on the first iteration of the loop to avoid duplicating idential proofs
    prover_to_use=$(get_prover $((i == 1)))

    new_nft_contract_address=$(aztec-wallet $prover_to_use \
      deploy NFT \
      --args $admin_and_minter_address $nft_name $nft_symbol \
      -f $admin_and_minter_address \
      | get_contract_address)

    new_nft_contract=$(jq -n \
      --arg address "$new_nft_contract_address" \
      --arg admin_and_minter "$admin_and_minter_address" \
      '{"address": $address, "type": "nft", "token_id": 1, "admin_and_minter": $admin_and_minter, "needs_setup": true}')
    new_nft_contracts=$(echo "$new_nft_contracts" | jq --argjson contract "$new_nft_contract" '. += [$contract]')
  done

  echo "$new_nft_contracts" | jq '.'

  add_to_state ".contracts" "$new_nft_contracts"
fi
