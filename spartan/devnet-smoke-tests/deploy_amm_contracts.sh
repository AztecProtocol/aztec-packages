# Check the amm contract count and create more if current < max_amm_contracts
amm_contract_count=$(jq '.contracts | map(select(.type=="amm")) | length' state.json)
max_amm_contracts=1
amm_contracts_per_run=1
accounts=$(jq -c '.accounts[]' state.json)

if [ "$amm_contract_count" -lt "$max_amm_contracts" ]; then
  new_amm_contracts="[]"

  num_new_amm_contracts=$(( amm_contracts_per_run < (max_amm_contracts - amm_contract_count) ? amm_contracts_per_run : (max_amm_contracts - amm_contract_count) ))
  for i in $(seq 1 $num_new_amm_contracts); do
    admin_and_minter_address=$(select_random_account "$accounts")

    # IS THERE A WAY TO DO THIS WITHOUT DOING IT BELOW USING QUOTES ? i.e. A$var(how to add something behind here)
    token_symbol_base=A"$amm_contract_count"TKN
    token_name_base=A"$amm_contract_count"Token

    # We don't want to prove any token deployments because we already have done so in the token tests
    prover_to_use_when_deploying_token="-p none"

    # We only use the prover on the first iteration of the loop to avoid duplicating identical proofs
    prover_to_use_when_deploying_amm=$([ $i -eq 1 ] && echo "-p native" || echo "-p none")

    token_0_address=$(aztec-wallet $prover_to_use_when_deploying_token \
      deploy Token \
      --args $admin_and_minter_address "$token_name_base"_0 "$token_symbol_base"_0 18 \
      -f $admin_and_minter_address \
      --node-url $NODE_URL \
      | grep "Contract deployed at" | awk '{print $4}')

    token_1_address=$(aztec-wallet $prover_to_use_when_deploying_token \
      deploy Token \
      --args $admin_and_minter_address "$token_name_base"_1 "$token_symbol_base"_1 18 \
      -f $admin_and_minter_address \
      --node-url $NODE_URL \
      | grep "Contract deployed at" | awk '{print $4}')

    token_liquidity_address=$(aztec-wallet $prover_to_use_when_deploying_token \
      deploy Token \
      --args $admin_and_minter_address "$token_name_base"_liquidity "$token_symbol_base"_liquidity 18 \
      -f $admin_and_minter_address \
      --node-url $NODE_URL \
      | grep "Contract deployed at" | awk '{print $4}')

    amm_address=$(aztec-wallet $prover_to_use_when_deploying_amm \
      deploy AMM \
      --args "$token_0_address" "$token_1_address" "$token_liquidity_address" \
      -f $admin_and_minter_address \
      --node-url $NODE_URL \
      | grep "Contract deployed at" | awk '{print $4}')

    new_amm_contract=$(jq -n \
      --arg token_0_address "$token_0_address" \
      --arg token_1_address "$token_1_address" \
      --arg token_liquidity_address "$token_liquidity_address" \
      --arg amm_address "$amm_address" \
      --arg admin_and_minter "$admin_and_minter_address" \
      '{"token_0_address": $token_0_address, "token_1_address": $token_1_address, "token_liquidity_address": $token_liquidity_address, "amm_address": $amm_address, "type": "amm", "admin_and_minter": $admin_and_minter, "inited": false}')
    new_amm_contracts=$(echo "$new_amm_contracts" | jq --argjson contract "$new_amm_contract" '. += [$contract]')
  done

  echo "$new_amm_contracts" | jq '.'

  jq --argjson new_amm_contracts "$new_amm_contracts" '.contracts += $new_amm_contracts' state.json > tmp.json && mv tmp.json state.json
fi
