# Update contracts to set inited=true for all contracts and accounts
jq '.contracts = (.contracts | map(. + {inited: true}))' state.json > temp.json && mv temp.json state.json
jq '.accounts = (.accounts | map(. + {inited: true}))' state.json > temp.json && mv temp.json state.json

echo "Updated all contracts and accounts in state.json with inited=true"
