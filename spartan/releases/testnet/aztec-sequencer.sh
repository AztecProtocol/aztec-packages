#!/usr/bin/env bash

set -e

# Colors and formatting
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Global variables
DEFAULT_P2P_PORT="40500"
DEFAULT_PORT="8080"
DEFAULT_KEY="0x0000000000000000000000000000000000000000000000000000000000000001"
# Try to get default IP from ipify API, otherwise leave empty to require user input
DEFAULT_IP=$(curl -s --connect-timeout 5 https://api.ipify.org?format=json | grep -o '"ip":"[^"]*' | cut -d'"' -f4 || echo "")
DEFAULT_BIND_MOUNT_DIR="$HOME/aztec-data"

# unset these to avoid conflicts with the host's environment
ETHEREUM_HOSTS=
L1_CONSENSUS_HOST_URLS=
IMAGE=
BOOTNODE_URL=
LOG_LEVEL=info
# Parse command line arguments
parse_args() {
  while [[ $# -gt 0 ]]; do
    case $1 in
    -b | --bootnode-url)
      BOOTNODE_URL="$2"
      shift 2
      ;;
    -n | --network)
      NETWORK="$2"
      shift 2
      ;;
    -i | --image)
      IMAGE="$2"
      shift 2
      ;;
    -e | --ethereum-hosts)
      ETHEREUM_HOSTS="$2"
      shift 2
      ;;
    -l | --l1-consensus-host-urls)
      L1_CONSENSUS_HOST_URLS="$2"
      shift 2
      ;;
    -p | --port)
      CLI_PORT="$2"
      shift 2
      ;;
    -p2p | --p2p-port)
      CLI_P2P_PORT="$2"
      shift 2
      ;;
    -ip | --ip)
      CLI_IP="$2"
      shift 2
      ;;
    -k | --key)
      CLI_KEY="$2"
      shift 2
      ;;
    -d | --data-dir)
      BIND_MOUNT_DIR="$2"
      shift 2
      ;;
    -pk | --p2p-id-private-key)
      PEER_ID_PRIVATE_KEY="$2"
      shift 2
      ;;
    -v | --verbose)
      LOG_LEVEL=debug
      shift
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

# Configure environment
configure_environment() {
  local args=("$@")
  parse_args "${args[@]}"

  echo -e "${BLUE}Configuring environment...${NC}"
  if [ -n "$NETWORK" ]; then
    NETWORK="$NETWORK"
  else
    read -p "Network [ignition-testnet]: " NETWORK
    NETWORK=${NETWORK:-ignition-testnet}
  fi

  # if the network is `ignition-testnet`
  if [ "$NETWORK" = "ignition-testnet" ]; then
    REGISTRY_CONTRACT_ADDRESS="${REGISTRY_CONTRACT_ADDRESS:-0x12b3ebc176a1646b911391eab3760764f2e05fe3}"
    # Determine architecture and set the image accordingly
    if [[ "$(uname -m)" == "x86_64" ]]; then
      IMAGE="${IMAGE:-aztecprotocol/aztec:1dc66419e0e7e1543bee081471701f90192fa33e-amd64}"
    else
      IMAGE="${IMAGE:-aztecprotocol/aztec:1dc66419e0e7e1543bee081471701f90192fa33e-arm64}"
    fi
  else
    # unknown network
    echo -e "${RED}Unknown network: $NETWORK${NC}"
  fi

  if [ -z "$IMAGE" ] || [ -z "$REGISTRY_CONTRACT_ADDRESS" ]; then
    echo -e "${RED}Bootstrap Nodes, Ethereum host, image and Registry contract address are required${NC}"
    exit 1
  fi

  if [ -n "$ETHEREUM_HOSTS" ]; then
    ETHEREUM_HOSTS="$ETHEREUM_HOSTS"
  else
    while true; do
      read -p "Sepolia Ethereum Host (ex. Infura, Alchemy, etc.): " ETHEREUM_HOSTS
      if [ -z "$ETHEREUM_HOSTS" ]; then
        echo -e "${RED}Error: Ethereum Hosts is required${NC}"
      else
        break
      fi
    done
  fi

  if [ -n "$L1_CONSENSUS_HOST_URLS" ]; then
    L1_CONSENSUS_HOST_URLS="$L1_CONSENSUS_HOST_URLS"
  else
    while true; do
      read -p "L1 Consensus Host URLs: " L1_CONSENSUS_HOST_URLS
      if [ -z "$L1_CONSENSUS_HOST_URLS" ]; then
        echo -e "${RED}Error: L1 Consensus Host URLs are required${NC}"
      else
        break
      fi
    done
  fi

  # # get the node info
  # get_node_info

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
      read -p "Validator Address (Coinbase): " COINBASE

      if [ -z "$COINBASE" ]; then
        echo -e "${RED}Error: Validator Address (Coinbase) is required${NC}"
      else
        if [[ "$COINBASE" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
          break
        else
          echo -e "${RED}Error: Invalid COINBASE address. Please enter a valid Ethereum address.${NC}"
        fi
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
  cat >.env <<EOF
P2P_IP=${IP}
P2P_PORT=${P2P_PORT}
P2P_LISTEN_ADDR=0.0.0.0
VALIDATOR_DISABLED=false
VALIDATOR_PRIVATE_KEY=${KEY}
SEQ_PUBLISHER_PRIVATE_KEY=${KEY}
L1_PRIVATE_KEY=${KEY}
DEBUG=aztec:*,-aztec:avm_simulator*,-aztec:circuits:artifact_hash,-aztec:libp2p_service,-json-rpc*,-aztec:world-state:database,-aztec:l2_block_stream*
LOG_LEVEL=${LOG_LEVEL:-info}
AZTEC_PORT=${PORT}
P2P_ENABLED=true
L1_CHAIN_ID=11155111
PROVER_REAL_PROOFS=true
PXE_PROVER_ENABLED=true
ETHEREUM_SLOT_DURATION=12
AZTEC_SLOT_DURATION=36
ETHEREUM_HOSTS=${ETHEREUM_HOSTS}
L1_CONSENSUS_HOST_URLS=${L1_CONSENSUS_HOST_URLS}
AZTEC_EPOCH_DURATION=32
AZTEC_PROOF_SUBMISSION_WINDOW=64
BOOTSTRAP_NODES=${BOOTSTRAP_NODES}
REGISTRY_CONTRACT_ADDRESS=${REGISTRY_CONTRACT_ADDRESS}
SLASH_FACTORY_CONTRACT_ADDRESS=0x0f216a792a4cc3691010e7870ae2c0f4fadd952a
DATA_DIRECTORY=/var/lib/aztec
PEER_ID_PRIVATE_KEY=${PEER_ID_PRIVATE_KEY}
COINBASE=${COINBASE}
TEST_ACCOUNTS=true
SEQ_MIN_TX_PER_BLOCK=0
SEQ_MAX_TX_PER_BLOCK=0
L1_FIXED_PRIORITY_FEE_PER_GAS=3
L1_GAS_LIMIT_BUFFER_PERCENTAGE=15
L1_GAS_PRICE_MAX=500
ARCHIVER_POLLING_INTERVAL_MS=1000
ARCHIVER_VIEM_POLLING_INTERVAL_MS=1000
L1_READER_VIEM_POLLING_INTERVAL_MS=1000
SEQ_VIEM_POLLING_INTERVAL_MS=1000
VERSION=aztecprotocol/aztec:1dc66419e0e7e1543bee081471701f90192fa33e-arm64
BOOTSTRAP_NODES=enr:-LO4QDwlKJN0BqMc4hYPsI-MQoR1O7qLVr4TK6DhqGsZT_pPTmg3gS-JD072rKI4vlaR0N4SdeH2gCD09oh-zMVT3JkEhWF6dGVjqDAwLTExMTU1MTExLTAwMDAwMDAwLTAtMmM4ZmM0NjMtMjM3YWFkY2WCaWSCdjSCaXCEI-XzqolzZWNwMjU2azGhA0da3IZGbY1tLdqXgdQKG-SW-Z4D6dvXJBeoXn8EZsCVg3VkcIKd0A,enr:-LO4QPJR493G_BQG1UU0_h-g0TEBnZEJ-zgWYH3YctVAn3GzfM9dWVIO7_TSETXYLy-h34bF6sSoSfpP5O44qsZnp00EhWF6dGVjqDAwLTExMTU1MTExLTAwMDAwMDAwLTAtMmM4ZmM0NjMtMjM3YWFkY2WCaWSCdjSCaXCEIlle64lzZWNwMjU2azGhAwuSF_VE1cRfSc3MvtDZvvaTl2Qo_dJK-Qp7TcnhYWBtg3VkcIKd0A,enr:-LO4QKq488wXvw6vAHToGWJYkxMmKsjQCsFjPs5Pt_MrawlnZ7G-xIfwhkXR1afddf8lFj_RNVZdBfGzHHR262pXNhMEhWF6dGVjqDAwLTExMTU1MTExLTAwMDAwMDAwLTAtMmM4ZmM0NjMtMjM3YWFkY2WCaWSCdjSCaXCEI8VFSYlzZWNwMjU2azGhA2xqOyFaHAARgLAi3dORuPmFHbxgoMDWBZJnnbiatW8jg3VkcIKd0A
REGISTRY_CONTRACT_ADDRESS=0x12b3ebc176a1646b911391eab3760764f2e05fe3
EOF

  # Generate docker-compose.yml
  cat >docker-compose.yml <<EOF
services:
    validator:
        network_mode: host
        restart: unless-stopped
        env_file: .env
        image: ${IMAGE}
        entrypoint: >
            sh -c '

            test -z "\$PEER_ID_PRIVATE_KEY" -a ! -f /var/lib/aztec/p2p-private-key && node /usr/src/yarn-project/aztec/dest/bin/index.js generate-p2p-private-key | head -1 | cut -d" " -f 3 | tee /var/lib/aztec/p2p-private-key || echo "Re-using existing P2P private key"
            test -z "\$PEER_ID_PRIVATE_KEY" && export PEER_ID_PRIVATE_KEY=\$(cat /var/lib/aztec/p2p-private-key)

            node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js start --node --archiver --sequencer'
EOF

  # Add volume configuration based on user choice
  if [ -n "$BIND_MOUNT_DIR" ]; then
    cat >>docker-compose.yml <<EOF
        volumes:
            - ${BIND_MOUNT_DIR}:/var/lib/aztec
EOF
  else
    cat >>docker-compose.yml <<EOF
        volumes:
            - aztec_data:/var/lib/aztec

volumes:
    aztec_data:
EOF
  fi

  echo -e "${GREEN}Configuration complete! Use './aztec-sequencer.sh start' to launch your node.${NC}"
}

# Docker commands
start_node() {
  if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}Configuration not found. Please run './aztec-sequencer.sh config' first.${NC}"
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
