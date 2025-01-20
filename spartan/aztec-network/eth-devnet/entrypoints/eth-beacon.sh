#! /bin/bash

lighthouse bn \
    --disable-peer-scoring \
    --disable-packet-filter \
    --enable-private-discovery \
    --disable-enr-auto-update \
    --staking \
    --http \
    --http-address=0.0.0.0 \
    --http-port=$BEACON_HTTP_PORT \
    --validator-monitor-auto \
    --http-allow-origin='*' \
    --listen-address=0.0.0.0 \
    --target-peers=0 \
    --testnet-dir=/genesis \
    --execution-endpoints=$ETH_EXECUTION_URL \
    --execution-jwt-secret-key="61e1dd9539e8cc37b3d71dcf8ce372f0e119cc1c73426ee80472a4214f2a41a1" \
    --allow-insecure-genesis-sync \
    --debug-level=info