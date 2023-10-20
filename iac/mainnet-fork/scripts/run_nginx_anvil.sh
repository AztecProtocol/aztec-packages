#!/bin/bash

set -eum pipefail

# Run nginx and anvil alongside each other
trap 'kill $(jobs -p)' SIGTERM

# Anvil defaults - Nginx assumes these values to be as they are
HOST="0.0.0.0"
PORT=8544
ETHEREUM_HOST=$HOST:$PORT

# Data directory for anvil state
mkdir -p /data

# Run anvil silently
.foundry/bin/anvil --silent --host $HOST -p $PORT -m "$MNEMONIC" -f=https://mainnet.infura.io/v3/$INFURA_API_KEY --chain-id=$CHAIN_ID --fork-block-number=15918000 --block-base-fee-per-gas=10 -s=$SNAPSHOT_FREQUENCY --state=./data/state --balance=1000000000000000000 >/dev/null &

echo "Waiting for ethereum host at $ETHEREUM_HOST..."
while ! curl -s $ETHEREUM_HOST >/dev/null; do sleep 1; done

echo "Starting nginx..."
nginx &
wait
