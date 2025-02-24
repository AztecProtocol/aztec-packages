#!/usr/bin/env bash
export DATA_DIRECTORY=$HOME/data
export DATA_STORE_MAP_SIZE_KB=16777216
export IP_ADDRESS="34.87.199.166"
export P2P_PORT=40400
export P2P_UDP_ANNOUNCE_ADDR="$IP_ADDRESS:$P2P_PORT"
export P2P_UDP_LISTEN_ADDR="$IP_ADDRESS:$P2P_PORT"
export PEER_ID_PRIVATE_KEY=080212209f94418c5d72b10b8b597fca34d65c0440822f6591d2872bb6fe07d78356c1d7
export BOOTSTRAP_NODES=""
export AZTEC_PORT=80

export NON_INTERACTIVE=1
INSTALL_URI=${INSTALL_URI:-https://install.aztec.network}
install_url="$INSTALL_URI/aztec-install"

mkdir -p $DATA_DIRECTORY

bash <(curl -s $install_url)

export VERSION=7b3a1c4d18b3fd084a34f56a538419933d4a373c

aztec start --p2p-bootstrap
#~/aztec3-packages/aztec-up/bin/aztec start --p2p-bootstrap
#$(cd ~/aztec3-packages/yarn-project/aztec && yarn start start --p2p-bootstrap)
