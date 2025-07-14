#!/bin/bash

/nethermind/nethermind \
  --datadir=/data \
  --init.chainspecpath=/genesis/genesis.json \
  --merge-pos=true \
  --jsonrpc.enabled=true \
  --jsonrpc.host=0.0.0.0 \
  --jsonrpc.port=${HTTP_PORT:-8545} \
  --jsonrpc.websocketport=${WS_PORT:-8546} \
  --jsonrpc.enabledmodules="Eth,Net,Web3,Debug,Trace,TxPool" \
  --jsonrpc.enginejwtsecret=/genesis/jwt-secret.hex \
  --jsonrpc.jwtauthtls=false \
  --jsonrpc.enginehost=0.0.0.0 \
  --jsonrpc.engineport=${ENGINE_PORT:-8551} \
  --jsonrpc.enabledcorsorigins="*" \
  --jsonrpc.enabledoriginaccesslist="*" \
  --network.p2penabled=false \
  --init.maxpeers=0 \
  --pruning.mode=None \
  --healthchecks.enabled=true \
  --log=INFO
