#!/bin/bash

tps=${TPS:-5}
time=${TIME:-600}
num_txs=${TXS:-$((time*tps))}
num_nodes=${NODES:-$(find ./data -maxdepth 1 -type d -regex './data/node[0-9]+$' | wc -l)}
size=${SIZE:-1000}
rate=$(awk "BEGIN {print 1/$tps}")
data=$(head -c $((size/2)) </dev/random | xxd -p | tr -d '\n')

for ((i=0; i<num_txs; i++)); do
  port=$((26657 + (i % num_nodes)))
  echo Sending tx $i of $num_txs with ${#data} bytes to port $port...
  tx="key${i}=${data}"
  curl -s  "localhost:${port}/broadcast_tx_async?tx=\"$tx\"" > /dev/null &
  sleep $rate
done
