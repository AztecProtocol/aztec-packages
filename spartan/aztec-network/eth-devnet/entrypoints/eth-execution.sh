#! /bin/bash

reth node \
    --http \
    --http.port=${HTTP_PORT} \
    --http.addr="0.0.0.0" \
    --http.api="admin,net,eth,web3,debug,trace" \
    --http.corsdomain="*" \
    --txpool.max-tx-input-bytes=${MAX_TX_INPUT_SIZE_BYTES} \
    --max-outbound-peers=0 \
    --max-inbound-peers=0 \
    --ipcdisable \
    --disable-discovery \
    --authrpc.addr="0.0.0.0" \
    --authrpc.port=8551 \
    --authrpc.jwtsecret="/genesis/jwt-secret.hex" \
    --chain="/genesis/genesis.json" \
    --datadir="/data" \
    -vv