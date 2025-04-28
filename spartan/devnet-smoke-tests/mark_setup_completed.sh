# Update contracts to set needs_setup=false for all contracts and accounts
jq '.contracts = (.contracts | map(. + {needs_setup: false}))' state.json > temp.json && mv temp.json state.json
jq '.accounts = (.accounts | map(. + {needs_setup: false}))' state.json > temp.json && mv temp.json state.json

echo "Updated all contracts and accounts in state.json with needs_setup=false"
