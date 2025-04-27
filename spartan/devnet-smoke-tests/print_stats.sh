# We print some basic stats about our run
account_count=$(jq '.accounts | length' state.json)
token_contract_count=$(jq '.contracts | map(select(.type=="token")) | length' state.json)
amm_contract_count=$(jq '.contracts | map(select(.type=="amm")) | length' state.json)
nft_contract_count=$(jq '.contracts | map(select(.type=="nft")) | length' state.json)

echo "Total accounts processed: $account_count"
echo "Total token contracts processed: $token_contract_count"
echo "Total amm contracts processed: $amm_contract_count"
echo "Total nft contracts processed: $nft_contract_count"
