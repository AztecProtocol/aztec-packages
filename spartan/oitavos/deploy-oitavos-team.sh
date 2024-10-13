#!/bin/bash
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# These need to be set in the environment
# AZTEC_IMAGE=$1
# ETHEREUM_HOST=$2
# BOOT_NODE_URL=$3
# VALIDATOR_PRIVATE_KEY=$4
# VALIDATOR_ADDRESS=$5
# PUBLIC_IP=$6
# NODE_PORT=$7
# P2P_TCP_PORT=$8
# P2P_UDP_PORT=$9

docker run $AZTEC_IMAGE get-node-info -u $BOOT_NODE_URL | tee $SCRIPT_DIR/node_info.txt

boot_node_enr=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'Node ENR: \Kenr:[a-zA-Z0-9\-\_\.]+')
rollup_address=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'Rollup Address: \K0x[a-fA-F0-9]{40}')
registry_address=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'Registry Address: \K0x[a-fA-F0-9]{40}')
inbox_address=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'L1 -> L2 Inbox Address: \K0x[a-fA-F0-9]{40}')
outbox_address=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'L2 -> L1 Outbox Address: \K0x[a-fA-F0-9]{40}')
fee_juice_address=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'Fee Juice Address: \K0x[a-fA-F0-9]{40}')
fee_juice_portal_address=$(cat $SCRIPT_DIR/node_info.txt | grep -oP 'Fee Juice Portal Address: \K0x[a-fA-F0-9]{40}')


# Write the addresses to a file in the shared volume
cat <<EOF > $SCRIPT_DIR/validator.env
BOOTSTRAP_NODES=$boot_node_enr
ROLLUP_CONTRACT_ADDRESS=$rollup_address
REGISTRY_CONTRACT_ADDRESS=$registry_address
INBOX_CONTRACT_ADDRESS=$inbox_address
OUTBOX_CONTRACT_ADDRESS=$outbox_address
FEE_JUICE_CONTRACT_ADDRESS=$fee_juice_address
FEE_JUICE_PORTAL_CONTRACT_ADDRESS=$fee_juice_portal_address
VALIDATOR_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY
L1_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY
SEQ_PUBLISHER_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY
ETHEREUM_HOST=$ETHEREUM_HOST
PORT=$NODE_PORT
LOG_LEVEL=debug
DEBUG="aztec:*,-aztec:avm_simulator*,-aztec:circuits:artifact_hash,-json-rpc*"
P2P_ENABLED=true
VALIDATOR_DISABLED=false
SEQ_MAX_SECONDS_BETWEEN_BLOCKS=0
SEQ_MIN_TX_PER_BLOCK=1
P2P_TCP_ANNOUNCE_ADDR=$PUBLIC_IP:$P2P_TCP_PORT
P2P_UDP_ANNOUNCE_ADDR=$PUBLIC_IP:$P2P_UDP_PORT
P2P_TCP_LISTEN_ADDR=0.0.0.0:$P2P_TCP_PORT
P2P_UDP_LISTEN_ADDR=0.0.0.0:$P2P_UDP_PORT
COINBASE=$VALIDATOR_ADDRESS
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://a67686223f98b4181a59f8aba911a177-1646930983.us-east-1.elb.amazonaws.com:4318/v1/metrics
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://a67686223f98b4181a59f8aba911a177-1646930983.us-east-1.elb.amazonaws.com:4318/v1/traces
EOF

cat $SCRIPT_DIR/validator.env

docker run $AZTEC_IMAGE add-l1-validator -u $ETHEREUM_HOST --validator $VALIDATOR_ADDRESS --rollup $rollup_address
docker run --rm \
 --env-file $SCRIPT_DIR/validator.env \
 -p $NODE_PORT:$NODE_PORT \
 -p $P2P_TCP_PORT:$P2P_TCP_PORT \
 -p $P2P_UDP_PORT:$P2P_UDP_PORT/udp \
 $AZTEC_IMAGE start --node --archiver --sequencer


