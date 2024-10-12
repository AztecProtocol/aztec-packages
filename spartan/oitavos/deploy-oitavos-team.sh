#!/bin/bash
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

IMAGE=$1
ETHEREUM_HOST=$2
BOOT_NODE_URL=$3
VALIDATOR_PRIVATE_KEY=$4
VALIDATOR_ADDRESS=$5
PUBLIC_IP=$6
NODE_PORT=$7
P2P_TCP_PORT=$8
P2P_UDP_PORT=$9

docker run $IMAGE get-node-info -u $BOOT_NODE_URL | tee $SCRIPT_DIR/node_info.txt

boot_node_enr=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'Node ENR: \Kenr:[a-zA-Z0-9\-\_\.]+')
rollup_address=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'Rollup Address: \K0x[a-fA-F0-9]{40}')
registry_address=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'Registry Address: \K0x[a-fA-F0-9]{40}')
inbox_address=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'L1 -> L2 Inbox Address: \K0x[a-fA-F0-9]{40}')
outbox_address=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'L2 -> L1 Outbox Address: \K0x[a-fA-F0-9]{40}')
fee_juice_address=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'Fee Juice Address: \K0x[a-fA-F0-9]{40}')
fee_juice_portal_address=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'Fee Juice Portal Address: \K0x[a-fA-F0-9]{40}')


# Write the addresses to a file in the shared volume
cat <<EOF > $SCRIPT_DIR/validator.env
export BOOTSTRAP_NODES=$boot_node_enr
export ROLLUP_CONTRACT_ADDRESS=$rollup_address
export REGISTRY_CONTRACT_ADDRESS=$registry_address
export INBOX_CONTRACT_ADDRESS=$inbox_address
export OUTBOX_CONTRACT_ADDRESS=$outbox_address
export FEE_JUICE_CONTRACT_ADDRESS=$fee_juice_address
export FEE_JUICE_PORTAL_CONTRACT_ADDRESS=$fee_juice_portal_address
export VALIDATOR_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY
export L1_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY
export SEQ_PUBLISHER_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY
export ETHEREUM_HOST=$ETHEREUM_HOST
export PORT=$NODE_PORT
export LOG_LEVEL=debug
export DEBUG="aztec:*,-aztec:avm_simulator*,-aztec:libp2p_service*,-aztec:circuits:artifact_hash,-json-rpc*"
export P2P_ENABLED=true
export VALIDATOR_DISABLED=false
export SEQ_MAX_SECONDS_BETWEEN_BLOCKS=0
export SEQ_MIN_TX_PER_BLOCK=1
export P2P_TCP_ANNOUNCE_ADDR=$PUBLIC_IP:$P2P_TCP_PORT
export P2P_UDP_ANNOUNCE_ADDR=$PUBLIC_IP:$P2P_UDP_PORT
export P2P_TCP_LISTEN_ADDR=0.0.0.0:$P2P_TCP_PORT
export P2P_UDP_LISTEN_ADDR=0.0.0.0:$P2P_UDP_PORT
EOF

cat $SCRIPT_DIR/validator.env

# TODO: change to MINT
docker run $IMAGE add-l1-validator --validator $VALIDATOR_ADDRESS --rollup $rollup_address
docker run \
 --env-file $SCRIPT_DIR/validator.env \
 -p $NODE_PORT:$NODE_PORT \
 -p $P2P_TCP_PORT:$P2P_TCP_PORT \
 -p $P2P_UDP_PORT:$P2P_UDP_PORT/udp \
 $IMAGE start --node --archiver --sequencer


