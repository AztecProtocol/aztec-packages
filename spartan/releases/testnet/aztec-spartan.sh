#!/bin/bash

set -e

# Colors and formatting
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Global variables
DEFAULT_P2P_PORT="40400"
DEFAULT_PORT="8080"
DEFAULT_KEY="0x0000000000000000000000000000000000000000000000000000000000000001"
# Try to get default IP from ipify API, otherwise leave empty to require user input
DEFAULT_IP=$(curl -s --connect-timeout 5 https://api.ipify.org?format=json | grep -o '"ip":"[^"]*' | cut -d'"' -f4 || echo "")
DEFAULT_BIND_MOUNT_DIR="$HOME/aztec-data"

# unset these to avoid conflicts with the host's environment
ETHEREUM_HOST=
IMAGE=
BOOTNODE_URL=


# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -b|--bootnode-url)
                BOOTNODE_URL="$2"
                shift 2
                ;;
            -n|--network)
                NETWORK="$2"
                shift 2
                ;;
            -i|--image)
                IMAGE="$2"
                shift 2
                ;;
            -e|--ethereum-host)
                ETHEREUM_HOST="$2"
                shift 2
                ;;
            -p|--port)
                CLI_PORT="$2"
                shift 2
                ;;
            -p2p|--p2p-port)
                CLI_P2P_PORT="$2"
                shift 2
                ;;
            -ip|--ip)
                CLI_IP="$2"
                shift 2
                ;;
            -k|--key)
                CLI_KEY="$2"
                shift 2
                ;;
            -d|--data-dir)
                BIND_MOUNT_DIR="$2"
                shift 2
                ;;
            -pk|--p2p-id-private-key)
                PEER_ID_PRIVATE_KEY="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
}

# Show banner function
show_banner() {
    echo -e "${BLUE}"
    echo "    _    ____ _____ _____ _____  _____ _____ ____ _____ _   _ _____ _____ "
    echo "   / \  |_  /|_   _| _____|  __/|_   _| ____/ ___|_   _| \ | | ____|_   _|"
    echo "  / _ \  / /   | | |  _|  | |     | | |  _| \___ \ | | |  \| |  _|   | |  "
    echo " / ___ \/ /_   | | | |___ | |__   | | | |___ ___) || | | |\  | |___  | |  "
    echo "/_/   \_\___|  |_| |______|____\  |_| |_____|____/ |_| |_| \_|_____| |_|  "
    echo -e "${NC}"
}

# Check if Docker is installed
check_docker() {
    echo -e "${BLUE}Checking Docker installation...${NC}"
    if command -v docker >/dev/null 2>&1 && command -v docker compose >/dev/null 2>&1; then
        echo -e "${GREEN}Docker and Docker Compose are installed${NC}"
        return 0
    else
        echo -e "${RED}Docker or Docker Compose not found${NC}"
        read -p "Would you like to install Docker? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            install_docker
            return $?
        fi
        return 1
    fi
}

# Install Docker
install_docker() {
    echo -e "${BLUE}Installing Docker...${NC}"
    if curl -fsSL https://get.docker.com | sh; then
        sudo usermod -aG docker $USER
        echo -e "${GREEN}Docker installed successfully${NC}"
        echo -e "${YELLOW}Please log out and back in for group changes to take effect${NC}"
        return 0
    else
        echo -e "${RED}Failed to install Docker${NC}"
        return 1
    fi
}

# Get public IP
get_public_ip() {
    echo -e "${BLUE}Fetching public IP...${NC}"
    PUBLIC_IP=$(curl -s https://api.ipify.org?format=json | grep -o '"ip":"[^"]*' | cut -d'"' -f4)
    if [ -n "$PUBLIC_IP" ]; then
        echo -e "${GREEN}Public IP: $PUBLIC_IP${NC}"
        return 0
    else
        echo -e "${YELLOW}Failed to get public IP${NC}"
        return 1
    fi
}

get_node_info() {
    echo -e "${BLUE}Fetching node info...${NC}"
    CMD="get-node-info --node-url ${BOOTNODE_URL} --json"
    # TODO: use the correct (corresponding) image
    # Can't do it today because `release/troll-turtle` doesn't support --json flag
    NODE_INFO=$(curl -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"node_getNodeInfo","params":[],"id":1}' -s ${BOOTNODE_URL})

    # Extract the relevant fields
    result=$(echo $NODE_INFO | jq -r '.result')
    L1_CHAIN_ID=$(echo $result | jq -r '.l1ChainId')
    BOOTSTRAP_NODES=$(echo $result | jq -r '.enr')
    REGISTRY_CONTRACT_ADDRESS=$(echo $result | jq -r '.l1ContractAddresses.registryAddress')
    GOVERNANCE_PROPOSER_CONTRACT_ADDRESS=$(echo $result | jq -r '.l1ContractAddresses.governanceProposerAddress')
    FEE_JUICE_CONTRACT_ADDRESS=$(echo $result | jq -r '.l1ContractAddresses.feeJuiceAddress')
    ROLLUP_CONTRACT_ADDRESS=$(echo $result | jq -r '.l1ContractAddresses.rollupAddress')
    REWARD_DISTRIBUTOR_CONTRACT_ADDRESS=$(echo $result | jq -r '.l1ContractAddresses.rewardDistributorAddress')
    GOVERNANCE_CONTRACT_ADDRESS=$(echo $result | jq -r '.l1ContractAddresses.governanceAddress')
    COIN_ISSUER_CONTRACT_ADDRESS=$(echo $result | jq -r '.l1ContractAddresses.coinIssuerAddress')
    FEE_JUICE_PORTAL_CONTRACT_ADDRESS=$(echo $result | jq -r '.l1ContractAddresses.feeJuicePortalAddress')
    INBOX_CONTRACT_ADDRESS=$(echo $result | jq -r '.l1ContractAddresses.inboxAddress')
    OUTBOX_CONTRACT_ADDRESS=$(echo $result | jq -r '.l1ContractAddresses.outboxAddress')

    echo -e "${GREEN}Node info fetched successfully${NC}"
    return 0
}

# Configure environment
configure_environment() {
    local args=("$@")
    parse_args "${args[@]}"

    echo -e "${BLUE}Configuring environment...${NC}"
    if [ -n "$NETWORK" ]; then
        NETWORK="$NETWORK"
    else
        read -p "Network [troll-turtle]: " NETWORK
        NETWORK=${NETWORK:-troll-turtle}
    fi

    # if the network is `troll-turtle`
    if [ "$NETWORK" = "troll-turtle" ]; then
        BOOTNODE_URL="${BOOTNODE_URL:-http://34.82.108.83:8080}"
        ETHEREUM_HOST="${ETHEREUM_HOST:-http://34.82.53.127:8545}"
        IMAGE="${IMAGE:-aztecprotocol/aztec:troll-turtle}"
    else
        # unknown network
        echo -e "${RED}Unknown network: $NETWORK${NC}"
    fi

    # Check that bootnode, ethereum host, and image are set
    if [ -z "$BOOTNODE_URL" ] || [ -z "$ETHEREUM_HOST" ] || [ -z "$IMAGE" ]; then
        echo -e "${RED}Bootnode, Ethereum host, and image are required${NC}"
        exit 1
    fi

    # get the node info
    get_node_info


    if [ -n "$CLI_P2P_PORT" ]; then
        P2P_PORT="$CLI_P2P_PORT"
    else
        read -p "P2P Port [$DEFAULT_P2P_PORT]: " P2P_PORT
        P2P_PORT=${P2P_PORT:-$DEFAULT_P2P_PORT}
    fi

    if [ -n "$CLI_PORT" ]; then
        PORT="$CLI_PORT"
    else
        read -p "Node Port [$DEFAULT_PORT]: " PORT
        PORT=${PORT:-$DEFAULT_PORT}
    fi

    if [ -n "$CLI_KEY" ]; then
        KEY="$CLI_KEY"
    else
        while true; do
            read -p "Validator Private Key: " KEY
            if [ -z "$KEY" ]; then
                echo -e "${RED}Error: Validator Private Key is required${NC}"
            else
                break
            fi
        done
    fi

    if [ -n "$CLI_COINBASE" ]; then
    COINBASE="$CLI_COINBASE"
    else
        while true; do
            read -p "COINBASE (default: 0xbaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa): " COINBASE
            COINBASE=${COINBASE:-0xbaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}
            if [[ "$COINBASE" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
                break
            else
                echo -e "${RED}Error: Invalid COINBASE address. Please enter a valid Ethereum address.${NC}"
            fi
        done
    fi

    if [ -n "$CLI_IP" ]; then
        IP="$CLI_IP"
    else
        if [ -z "$DEFAULT_IP" ]; then
            while true; do
                read -p "Public IP: " IP
                if [ -z "$IP" ]; then
                    echo -e "${RED}Error: Public IP is required${NC}"
                else
                    break
                fi
            done
        else
            read -p "Public IP [$DEFAULT_IP]: " IP
            IP=${IP:-$DEFAULT_IP}
        fi
    fi

    if [ -n "$BIND_MOUNT_DIR" ]; then
        BIND_MOUNT_DIR="$BIND_MOUNT_DIR"
    else
        read -p "Use docker volume for data directory? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            read -p "Relative path for data directory [${DEFAULT_BIND_MOUNT_DIR}]: " BIND_MOUNT_DIR
            BIND_MOUNT_DIR=${BIND_MOUNT_DIR:-$DEFAULT_BIND_MOUNT_DIR}
        fi
    fi


    # Generate .env file
    cat > .env << EOF
P2P_UDP_ANNOUNCE_ADDR=${IP}:${P2P_PORT}
P2P_TCP_ANNOUNCE_ADDR=${IP}:${P2P_PORT}
VALIDATOR_DISABLED=false
VALIDATOR_PRIVATE_KEY=${KEY}
SEQ_PUBLISHER_PRIVATE_KEY=${KEY}
L1_PRIVATE_KEY=${KEY}
DEBUG=aztec:*,-aztec:avm_simulator*,-aztec:circuits:artifact_hash,-aztec:libp2p_service,-json-rpc*,-aztec:world-state:database,-aztec:l2_block_stream*
LOG_LEVEL=debug
AZTEC_PORT=${PORT}
P2P_ENABLED=true
L1_CHAIN_ID=${L1_CHAIN_ID}
PROVER_REAL_PROOFS=true
PXE_PROVER_ENABLED=true
ETHEREUM_SLOT_DURATION=12sec
AZTEC_SLOT_DURATION=36
AZTEC_EPOCH_DURATION=32
AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS=13
ETHEREUM_HOST=${ETHEREUM_HOST}
BOOTSTRAP_NODES=${BOOTSTRAP_NODES}
REGISTRY_CONTRACT_ADDRESS=${REGISTRY_CONTRACT_ADDRESS}
GOVERNANCE_PROPOSER_CONTRACT_ADDRESS=${GOVERNANCE_PROPOSER_CONTRACT_ADDRESS}
FEE_JUICE_CONTRACT_ADDRESS=${FEE_JUICE_CONTRACT_ADDRESS}
ROLLUP_CONTRACT_ADDRESS=${ROLLUP_CONTRACT_ADDRESS}
REWARD_DISTRIBUTOR_CONTRACT_ADDRESS=${REWARD_DISTRIBUTOR_CONTRACT_ADDRESS}
GOVERNANCE_CONTRACT_ADDRESS=${GOVERNANCE_CONTRACT_ADDRESS}
COIN_ISSUER_CONTRACT_ADDRESS=${COIN_ISSUER_CONTRACT_ADDRESS}
FEE_JUICE_PORTAL_CONTRACT_ADDRESS=${FEE_JUICE_PORTAL_CONTRACT_ADDRESS}
INBOX_CONTRACT_ADDRESS=${INBOX_CONTRACT_ADDRESS}
OUTBOX_CONTRACT_ADDRESS=${OUTBOX_CONTRACT_ADDRESS}
P2P_UDP_LISTEN_ADDR=0.0.0.0:${P2P_PORT}
P2P_TCP_LISTEN_ADDR=0.0.0.0:${P2P_PORT}
DATA_DIRECTORY=/var/lib/aztec
PEER_ID_PRIVATE_KEY=${PEER_ID_PRIVATE_KEY}
EOF

    # Generate docker-compose.yml
    cat > docker-compose.yml << EOF
services:
    validator:
        network_mode: host
        restart: unless-stopped
        env_file: .env
        image: ${IMAGE}
        ports:
            - ${P2P_PORT}:${P2P_PORT}/tcp
            - ${P2P_PORT}:${P2P_PORT}/udp
            - ${PORT}:${PORT}/tcp
        entrypoint: >
            sh -c '

            test -z "\$PEER_ID_PRIVATE_KEY" -a ! -f /var/lib/aztec/p2p-private-key && node /usr/src/yarn-project/aztec/dest/bin/index.js generate-p2p-private-key | head -1 | cut -d" " -f 3 | tee /var/lib/aztec/p2p-private-key || echo "Re-using existing P2P private key"
            test -z "\$PEER_ID_PRIVATE_KEY" && export PEER_ID_PRIVATE_KEY=\$(cat /var/lib/aztec/p2p-private-key)

            node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js start --node --archiver --sequencer'
EOF

    # Add volume configuration based on user choice
    if [ -n "$BIND_MOUNT_DIR" ]; then
        cat >> docker-compose.yml << EOF
        volumes:
            - ${BIND_MOUNT_DIR}:/var/lib/aztec
EOF
    else
        cat >> docker-compose.yml << EOF
        volumes:
            - aztec_data:/var/lib/aztec

volumes:
    aztec_data:
EOF
    fi

    echo -e "${GREEN}Configuration complete! Use './aztec-spartan.sh start' to launch your node.${NC}"
}

# Docker commands
start_node() {
    if [ ! -f "docker-compose.yml" ]; then
        echo -e "${RED}Configuration not found. Please run './aztec-spartan.sh config' first.${NC}"
        exit 1
    fi
    echo -e "${BLUE}Starting containers...${NC}"
    if docker compose up -d; then
        echo -e "${GREEN}Containers started successfully${NC}"
    else
        echo -e "${RED}Failed to start containers${NC}"
        exit 1
    fi
}

stop_node() {
    echo -e "${BLUE}Stopping containers...${NC}"
    if docker compose down; then
        echo -e "${GREEN}Containers stopped successfully${NC}"
    else
        echo -e "${RED}Failed to stop containers${NC}"
        exit 1
    fi
}

update_node() {
    echo -e "${BLUE}Pulling latest images...${NC}"
    if docker compose pull; then
        echo -e "${GREEN}Images updated successfully${NC}"
    else
        echo -e "${RED}Failed to update images${NC}"
        exit 1
    fi
}

show_logs() {
    echo -e "${BLUE}Fetching logs...${NC}"
    if ! docker compose logs -f; then
        echo -e "${RED}Failed to fetch logs${NC}"
        exit 1
    fi
}

# Main script
case "$1" in
    "config")
        show_banner
        check_docker
        configure_environment "$@"
        ;;
    "start")
        start_node
        ;;
    "stop")
        stop_node
        ;;
    "update")
        update_node
        ;;
    "logs")
        show_logs
        ;;
    *)
        echo "Usage: $0 {config|start|stop|update|logs}"
        echo "Commands:"
        echo "  config   - Install and configure Aztec Testnet node"
        echo "  start   - Start Aztec Testnet node"
        echo "  stop    - Stop Aztec Testnet node"
        echo "  update  - Update Aztec Testnet node images"
        echo "  logs    - Show Aztec Testnet node logs"
        exit 1
        ;;
esac

