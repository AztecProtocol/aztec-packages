#!/bin/bash

cd $(dirname $0)

yarn
yarn generate

# Generate testnet configs.
if [ ! -d ./data ]; then
  mkdir -p data
  docker run -ti --rm --user $(id -u):$(id -g) -v$PWD/data:/cometbft cometbft/cometbft testnet --v 2 --o /cometbft
fi