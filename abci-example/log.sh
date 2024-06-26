#!/bin/bash
set -e

node=${1:-0}

function cleanup {
  pkill -P $$
}

trap cleanup EXIT

function mempool {
  while true; do
    curl -s http://localhost:$((26657+node))/num_unconfirmed_txs | jq -r .result.total
    sleep 1
  done
}

mempool &

docker logs -f node$node | stdbuf -oL grep --color=always -E "Timed out|num_txs=|AZT"