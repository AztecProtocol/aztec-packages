#!/bin/bash

set -eu

export NODE_OPTIONS="--max-old-space-size=4608"
export LOG_LEVEL="debug; info: aztec:simulator, json-rpc"
export AZTEC_PORT=8080
export P2P_ENABLED="true"
export COINBASE="0xbaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbb"
export VALIDATOR_DISABLED="false"
export L1_CHAIN_ID=1337
export SEQ_MAX_SECONDS_BETWEEN_BLOCKS=0
export SEQ_MIN_TX_PER_BLOCK=0
export PROVER_REAL_PROOFS="false"
export PXE_PROVER_ENABLED="false"
export ETHEREUM_SLOT_DURATION=12
export VALIDATOR_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
export USE_GCLOUD_LOGGING="false"
export USE_GCLOUD_METRICS="false"
export P2P_TCP_ANNOUNCE_ADDR="0.0.0.0:60000"
export P2P_TCP_LISTEN_ADDR="0.0.0.0:60000"
export P2P_UDP_ANNOUNCE_ADDR="0.0.0.0:60000"
export P2P_UDP_LISTEN_ADDR="0.0.0.0:60000"
export ETHEREUM_HOST="http://localhost:8545"
export REGISTRY_CONTRACT_ADDRESS="0x29f815e32efdef19883cf2b92a766b7aebadd326"
export TEST_ACCOUNTS=false

EXE="/home/mitch/aztec-clones/alpha/yarn-project/aztec/dest/bin/index.js"

node $EXE start --node --archiver --sequencer --pxe
