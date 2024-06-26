#!/bin/bash
set -e

cd $(dirname $0)

repo=${CMT_REPO:-$HOME/github/cometbft}

(cd $repo && make build)
cp $repo/build/cometbft ./cometbft/cometbft
docker build -t aztecprotocol/abci .