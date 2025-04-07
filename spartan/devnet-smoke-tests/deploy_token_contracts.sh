# Check the current token contract count and create more if current < max_token_contracts
echo "Starting to deploy token contracts"

token_contract_count=$(jq '.contracts | map(select(.type=="token")) | length' state.json)
max_token_contracts=1
token_contracts_per_run=1
accounts=$(jq -c '.accounts[]' state.json)

if [ "$token_contract_count" -lt "$max_token_contracts" ]; then
  new_token_contracts="[]"

  num_new_token_contracts=$(( token_contracts_per_run < (max_token_contracts - token_contract_count) ? token_contracts_per_run : (max_token_contracts - token_contract_count) ))
  for i in $(seq 1 $num_new_token_contracts); do
    admin_and_minter_address=$(select_random_account "$accounts")

    token_symbol=TKN$token_contract_count
    token_name=Token$token_contract_count

    # We only use the prover on the first iteration of the loop to avoid duplicating identical proofs
    # TODO(ek): Re-enable after testing
    # prover_to_use=$([ $i -eq 1 ] && echo "-p native" || echo "-p none")
    prover_to_use="-p none"

    new_token_contract_address=$(aztec-wallet $prover_to_use \
      deploy Token \
      --args $admin_and_minter_address $token_name $token_symbol 18 \
      -f $admin_and_minter_address \
      --node-url $NODE_URL \
      | grep "Contract deployed at" | awk '{print $4}')

    new_token_contract=$(jq -n \
      --arg address "$new_token_contract_address" \
      --arg admin_and_minter "$admin_and_minter_address" \
      '{"address": $address, "type": "token", "admin_and_minter": $admin_and_minter, "inited": false}')
    new_token_contracts=$(echo "$new_token_contracts" | jq --argjson contract "$new_token_contract" '. += [$contract]')
  done

  echo "$new_token_contracts" | jq '.'

  jq --argjson new_token_contracts "$new_token_contracts" '.contracts += $new_token_contracts' state.json > tmp.json && mv tmp.json state.json
fi
