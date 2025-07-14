#!/bin/bash

/nethermind/nethermind \
  --datadir=/data \
  --Init.ChainSpecPath=/genesis/genesis.json \
  --Merge.PoS=true \
  --JsonRpc.Enabled=true \
  --JsonRpc.Host=0.0.0.0 \
  --JsonRpc.Port=${HTTP_PORT:-8545} \
  --JsonRpc.WebSocketsPort=${WS_PORT:-8546} \
  --JsonRpc.EnabledModules="Eth,Net,Web3,Debug,Trace,TxPool" \
  --JsonRpc.EngineJwtSecret=/genesis/jwt-secret.hex \
  --JsonRpc.JwtAuthTls=false \
  --JsonRpc.EngineHost=0.0.0.0 \
  --JsonRpc.EnginePort=${ENGINE_PORT:-8551} \
  --JsonRpc.EnabledCorsOrigins="*" \
  --JsonRpc.EnabledOriginAccessList="*" \
  --Network.P2PEnabled=false \
  --Init.MaxPeers=0 \
  --Pruning.Mode=None \
  --HealthChecks.Enabled=true \
  --log=INFO
