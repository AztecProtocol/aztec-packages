token_contract_count=$(jq '.contracts | map(select(.type=="token")) | length' state.json)
max_token_contracts=1
token_contracts_per_run=1
accounts=$(jq -c '.accounts[]' state.json)

# Check the current token contract count and create more if current < max_token_contracts
if [ "$token_contract_count" -lt "$max_token_contracts" ]; then
  new_token_contracts="[]"

  num_new_token_contracts=$(( token_contracts_per_run < (max_token_contracts - token_contract_count) ? token_contracts_per_run : (max_token_contracts - token_contract_count) ))
  for i in $(seq 1 $num_new_token_contracts); do
    admin_and_minter_address=$(select_random_account "$accounts")

    token_symbol="TKN_$((token_contract_count + i))"
    token_name="Token_$((token_contract_count + i))"

    # We only use the prover on the first iteration of the loop - while we need all tokens to be deployed, proving is
    # expensive and a single successful run is enough for the purposes of a smoke test.
    prover_to_use=$(get_prover $((i == 1)))

    new_token_contract_address=$(aztec-wallet $prover_to_use \
      deploy Token \
      --args $admin_and_minter_address $token_name $token_symbol 18 \
      -f $admin_and_minter_address \
      | get_contract_address)

    new_token_contract=$(jq -n \
      --arg address "$new_token_contract_address" \
      --arg admin_and_minter "$admin_and_minter_address" \
      '{"address": $address, "type": "token", "admin_and_minter": $admin_and_minter, "needs_setup": true}')
    new_token_contracts=$(echo "$new_token_contracts" | jq --argjson contract "$new_token_contract" '. += [$contract]')
  done

  echo "$new_token_contracts" | jq '.'

  add_to_state ".contracts" "$new_token_contracts"
fi
