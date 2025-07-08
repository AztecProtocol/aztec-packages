#!/bin/bash

geth \
  --datadir=/data \
  --authrpc.addr=0.0.0.0 \
  --authrpc.port=${ENGINE_PORT:-8551} \
  --authrpc.jwtsecret=/genesis/jwt-secret.hex \
  --http \
  --http.addr 0.0.0.0 \
  --http.port ${HTTP_PORT:-8545} \
  --http.api "admin,net,eth,web3,debug,txpool,trace" \
  --http.corsdomain "*" \
  --http.vhosts "*" \
  --ws \
  --ws.addr 0.0.0.0 \
  --ws.port ${WS_PORT:-8546} \
  --ws.api "admin,net,eth,web3,debug,txpool,trace" \
  --ws.origins "*" \
  --maxpeers 0 \
  --nodiscover \
  --ipcdisable \
  --verbosity 3 # \
#${GETH_EXTRA_ARGS:-}
