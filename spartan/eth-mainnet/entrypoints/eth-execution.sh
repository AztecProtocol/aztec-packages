#! /bin/bash

reth node \
    --chain=mainnet \
    --http \
    --http.port=${HTTP_PORT} \
    --http.addr="0.0.0.0" \
    --http.api="admin,net,eth,web3,debug,trace" \
    --http.corsdomain="*" \
    --ws \
    --ws.addr="0.0.0.0" \
    --ws.port=${WS_PORT} \
    --ws.api="admin,net,eth,web3,debug,trace" \
    --ws.origins="*" \
    --authrpc.addr="0.0.0.0" \
    --authrpc.port=8551 \
    --authrpc.jwtsecret="/jwt/jwt-secret.hex" \
    --datadir="/data" \
    --log.stdout.format=json \
    -vv




