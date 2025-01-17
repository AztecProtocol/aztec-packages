
export L1_CHAIN_ID=$(curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  $ETHEREUM_HOST | grep -o '"result":"0x[^"]*"' | cut -d'"' -f4 | xargs printf "%d\n")

echo "Using L1 chain ID: $L1_CHAIN_ID"