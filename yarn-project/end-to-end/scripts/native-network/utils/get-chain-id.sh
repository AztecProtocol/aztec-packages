for HOST in $(echo "${ETHEREUM_HOSTS}" | tr ',' '\n'); do
  RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    "$HOST" 2>/dev/null) || continue
  if echo "$RESULT" | grep -q '"result":"0x'; then
    export L1_CHAIN_ID=$(echo "$RESULT" | grep -o '"result":"0x[^"]*"' | cut -d'"' -f4 | xargs printf "%d\n")
    echo "Using L1 chain ID: $L1_CHAIN_ID from $HOST"
    return 0
  fi
done

echo "Error: Could not get chain ID from any host in: $ETHEREUM_HOSTS"
return 1
