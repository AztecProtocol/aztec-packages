#!/bin/bash

/nethermind/nethermind \
  --config none \
  --datadir=/data \
  --Init.ChainSpecPath=/genesis/chainspec.json \
  --Merge.Enabled=true \
  --JsonRpc.Enabled=true \
  --JsonRpc.Host=0.0.0.0 \
  --JsonRpc.Port=${HTTP_PORT:-8545} \
  --JsonRpc.WebSocketsPort=${WS_PORT:-8546} \
  --JsonRpc.EnabledModules="Eth,Net,Web3,Debug,Trace,TxPool" \
  --JsonRpc.JwtSecretFile=/genesis/jwt-secret.hex \
  --JsonRpc.EngineHost=0.0.0.0 \
  --JsonRpc.EnginePort=${ENGINE_PORT:-8551} \
  --JsonRpc.CorsOrigins="*" \
  --Sync.NetworkingEnabled=false \
  --Pruning.Mode=None \
  --HealthChecks.Enabled=true \
  --log=INFO
