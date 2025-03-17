# Check the current token contract count and create more if current < max_token_contracts
token_contract_count=$(jq '.contracts | map(select(.type=="token")) | length' state.json)
max_token_contracts=1
token_contracts_per_run=1

if [ "$token_contract_count" -lt "$max_token_contracts" ]; then
  new_token_contracts="[]"

  num_new_token_contracts=$(( token_contracts_per_run < (max_token_contracts - token_contract_count) ? token_contracts_per_run : (max_token_contracts - token_contract_count) ))
  for i in $(seq 1 $num_new_token_contracts); do
    new_token_contract_address=$(aztec-wallet $([ $i -eq 1 ] && echo "-p native" || echo "") deploy Token --args accounts:test0 Test TST 18 -f test0 --node-url $NODE_URL -a token | grep "Contract deployed at" | awk '{print $4}')

    new_token_contract=$(jq -n --arg address "$new_token_contract_address" '{"address": $address, "type": "token", "inited": false}')
    new_token_contracts=$(echo "$new_token_contracts" | jq --argjson contract "$new_token_contract" '. += [$contract]')
  done

  echo "$new_token_contracts" | jq '.'

  jq --argjson new_token_contracts "$new_token_contracts" '.contracts += $new_token_contracts' state.json > tmp.json && mv tmp.json state.json
fi
