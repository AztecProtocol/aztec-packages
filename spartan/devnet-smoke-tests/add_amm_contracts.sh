# Check the amm contract count and create more if current < max_amm_contracts
amm_contract_count=$(jq '.contracts | map(select(.type=="amm")) | length' state.json)
max_amm_contracts=1
amm_contracts_per_run=1

if [ "$amm_contract_count" -lt "$max_amm_contracts" ]; then
  new_amm_contracts="[]"

  num_new_amm_contracts=$(( amm_contracts_per_run < (max_amm_contracts - amm_contract_count) ? amm_contracts_per_run : (max_amm_contracts - amm_contract_count) ))
  for i in $(seq 1 $num_new_amm_contracts); do
    token_0_address=$(aztec-wallet deploy Token --args accounts:test0 Test TST 18 -f test0 --node-url $NODE_URL -a token_0 | grep "Contract deployed at" | awk '{print $4}')
    token_1_address=$(aztec-wallet deploy Token --args accounts:test0 Test TST 18 -f test0 --node-url $NODE_URL -a token_1 | grep "Contract deployed at" | awk '{print $4}')
    token_liquidity_address=$(aztec-wallet deploy Token --args accounts:test0 Test TST 18 -f test0 --node-url $NODE_URL -a token_liquidity | grep "Contract deployed at" | awk '{print $4}')
    amm_address=$(aztec-wallet $([ $i -eq 1 ] && echo "-p native" || echo "") deploy AMM --args "$token_0_address" "$token_1_address" "$token_liquidity_address" -f test0 --node-url $NODE_URL -a amm | grep "Contract deployed at" | awk '{print $4}')

    new_amm_contract=$(jq -n \
      --arg token_0_address "$token_0_address" \
      --arg token_1_address "$token_1_address" \
      --arg token_liquidity_address "$token_liquidity_address" \
      --arg amm_address "$amm_address" \
      '{"token_0_address": $token_0_address, "token_1_address": $token_1_address, "token_liquidity_address": $token_liquidity_address, "amm_address": $amm_address, "type": "amm", "inited": false}')
    new_amm_contracts=$(echo "$new_amm_contracts" | jq --argjson contract "$new_amm_contract" '. += [$contract]')
  done

  echo "$new_amm_contracts" | jq '.'

  jq --argjson new_amm_contracts "$new_amm_contracts" '.contracts += $new_amm_contracts' state.json > tmp.json && mv tmp.json state.json
fi
