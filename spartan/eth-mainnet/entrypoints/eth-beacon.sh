#! /bin/sh

echo "Starting lighthouse beacon on mainnet"

CHECKPOINT_ARG=""
if [ -n "$CHECKPOINT_SYNC_URL" ]; then
  CHECKPOINT_ARG="--checkpoint-sync-url=$CHECKPOINT_SYNC_URL"
fi

lighthouse bn \
    --network mainnet \
    --disable-peer-scoring \
    --disable-packet-filter \
    --enable-private-discovery \
    --disable-enr-auto-update \
    --http \
    --http-address=0.0.0.0 \
    --http-port=${BEACON_HTTP_PORT} \
    --http-allow-origin='*' \
    --listen-address=0.0.0.0 \
    --execution-endpoint=${ETH_EXECUTION_URL} \
    --execution-jwt=/jwt/jwt-secret.hex \
    --log-format=JSON \
    --debug-level=info \
    $CHECKPOINT_ARG




