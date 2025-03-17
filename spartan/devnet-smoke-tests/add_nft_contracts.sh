# Check the current nft contract count and create more if current < max_nft_contracts
nft_contract_count=$(jq '.contracts | map(select(.type=="nft")) | length' state.json)
max_nft_contracts=1
nft_contracts_per_run=1

if [ "$nft_contract_count" -lt "$max_nft_contracts" ]; then
  new_nft_contracts="[]"

  num_new_nft_contracts=$(( nft_contracts_per_run < (max_nft_contracts - nft_contract_count) ? nft_contracts_per_run : (max_nft_contracts - nft_contract_count) ))
  for i in $(seq 1 $num_new_nft_contracts); do
    new_nft_contract_address=$(aztec-wallet $([ $i -eq 1 ] && echo "-p native" || echo "") deploy NFT --args accounts:test0 Test TST -f test0 --node-url $NODE_URL -a token | grep "Contract deployed at" | awk '{print $4}')

    new_nft_contract=$(jq -n --arg address "$new_nft_contract_address" '{"address": $address, "type": "nft", "token_id": 1, "inited": false}')
    new_nft_contracts=$(echo "$new_nft_contracts" | jq --argjson contract "$new_nft_contract" '. += [$contract]')
  done

  echo "$new_nft_contracts" | jq '.'

  jq --argjson new_nft_contracts "$new_nft_contracts" '.contracts += $new_nft_contracts' state.json > tmp.json && mv tmp.json state.json
fi
