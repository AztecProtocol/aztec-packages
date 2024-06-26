#!/bin/bash
set -e

cleanup() {
    kill $(jobs -p)
}
trap cleanup EXIT

yarn start &

while ! (echo > /dev/tcp/localhost/26658)  2> /dev/null; do
    sleep 1
done

export CMTHOME=/cometbft
./cometbft/cometbft node --abci grpc --consensus.create_empty_blocks_interval 60s --proxy_app=tcp://localhost:26658 --rpc.laddr tcp://0.0.0.0:26657