---
sidebar_position: 3
title: How to Run an Aztec Prover
description: A comprehensive guide to setting up and running an Aztec Prover node on testnet or mainnet, including hardware requirements, configuration options, and performance optimization tips.
keywords:
  [
    aztec,
    prover,
    node,
    blockchain,
    L2,
    scaling,
    ethereum,
    zero-knowledge,
    ZK,
    setup,
    tutorial,
  ]
tags:
  - prover
  - node
  - tutorial
  - infrastructure
---

## Background

This guide covers the steps required to run a prover on the Aztec network. Before you begin, you should understand that operating a prover is a resource-intensive role typically undertaken by experienced engineers due to its technical complexity and hardware requirements.

Aztec provers are critical infrastructure components that generate cryptographic proofs attesting to transaction correctness, ultimately producing a single rollup proof submitted to Ethereum.

The prover consists of three main components:

1. **Prover node**: Polls L1 for unproven epochs, creates prover jobs, distributes them to the broker, and submits the final rollup proof to the rollup contract.

2. **Prover broker**: Manages the job queue, distributing work to agents and collecting results.

3. **Prover agent(s)**: Executes proof generation jobs in a stateless manner.

## Prerequisites

The minimum hardware specifications for each of the components is listed below.

#### Prover Node

Minimum specifications:

- 2 core / 4 vCPU (released in 2015 or later)
- 16 GB RAM
- 1 TB NVMe SSD
- 25 Mbps network connection

#### Prover Broker

Minimum specifications:

- 2 core / 4 vCPU (released in 2015 or later)
- 16 GB RAM
- 10 GB SSD

#### Prover Agents

Minimum specifications (for each agent):

- 32 core / 64 vCPU (released in 2015 or later)
- 128 GB RAM
- 10 GB SSD

This guide outlines a basic, non-distributed setup with all components on a single machine. Your hardware must meet or exceed the prover agent requirements listed above.

This guide assumes you are using a standard Linux distribution (Debian or Ubuntu).

### Required Software

- Docker and the Aztec toolchain installed via aztec-up (see the [getting started section](../../index.md))
- Docker Compose ([installation guide](https://docs.docker.com/compose/install/))
- Access to L1 node endpoints (execution and consensus clients). See [Eth Docker's guide](https://ethdocker.com/Usage/QuickStart) if you need to set these up.

## Configure the Prover

Setting up a prover involves configuring three components through environment variables and Docker Compose.

### Setup Steps

1. Configure components via environment variables
2. Enable auto-update and auto-restart functionality
3. Deploy with Docker Compose

First, create the directory structure for prover data storage:

```sh
mkdir -p aztec-prover/prover-node-data aztec-prover/prover-broker-data
cd aztec-prover
touch .env
```

### Component Configuration

Each prover component requires specific environment variables. Configure them as follows:

#### Prover Node

Required environment variables:

- `DATA_DIRECTORY`: the folder where the data of the prover node is stored
- `P2P_IP`: the IP address of this prover node
- `P2P_PORT`: the port that P2P communication happens on
- `ETHEREUM_HOSTS`: the execution RPC endpoints
- `L1_CONSENSUS_HOST_URLS`: the consensus RPC endpoints
- `LOG_LEVEL`: the desired level of logging for the prover node. It defaults to `INFO`
- `PROVER_BROKER_HOST`: the endpoint of the prover broker that this node sends prover jobs to
- `PROVER_PUBLISHER_PRIVATE_KEY`: the private key of the Ethereum EOA used for publishing the proofs to L1
- `AZTEC_PORT`: the port that the prover node API is exposed on

Add the following to your `.env` file (assuming default ports of 8080 for the prover node, and 40400 for p2p connectivity):

```sh
DATA_DIRECTORY=./prover-node-data
P2P_IP=<your external IP address>
P2P_PORT=40400
ETHEREUM_HOSTS=<your L1 execution endpoint, or a comma separated list if you have multiple>
L1_CONSENSUS_HOST_URLS=<your L1 consensus endpoint, or a comma separated list if you have multiple>
LOG_LEVEL=info
PROVER_BROKER_HOST=http://prover-broker:8080
PROVER_PUBLISHER_PRIVATE_KEY=<the private key of the L1 EOA your prover will publish proofs from>
AZTEC_PORT=8080
```

**Note**: The broker URL `http://prover-broker:8080` references the Docker Compose service name defined later.

:::tip
You MUST forward ports for P2P connectivity. Configure your router to forward both UDP and TCP traffic on the port specified by `P2P_PORT` to your local IP address.

To find your public IP address, run: `curl ipv4.icanhazip.com`
:::

#### Prover Broker

Required environment variables:

- `DATA_DIRECTORY`: the folder where the data of the prover broker is stored
- `LOG_LEVEL`: the desired level of logging for the prover broker. It defaults to `INFO`
- `ETHEREUM_HOSTS`: the execution RPC endpoints
- `P2P_IP`: the IP address of this prover broker
- `P2P_PORT`: the port that P2P communication happens on

**Note**: Some variables overlap with the prover node configuration. If running components on separate machines, adjust accordingly. Since `DATA_DIRECTORY` is used by both components, define a separate variable for the broker:

Add to your `.env` file:

```sh
PROVER_BROKER_DATA_DIRECTORY=./prover-broker-data
```

#### Prover Agent

Required environment variables:

- `PROVER_AGENT_COUNT`: Number of agents to run
- `PROVER_AGENT_POLL_INTERVAL_MS`: Polling interval for job requests (milliseconds)
- `PROVER_BROKER_HOST`: Broker endpoint for job submission
- `PROVER_ID`: Ethereum address corresponding to `PROVER_PUBLISHER_PRIVATE_KEY`

**Note**: Some variables overlap with the prover node configuration. In this case we use the same value for `PROVER_BROKER_HOST`, so we will not duplicate it in our `.env` file.

Add to your `.env` file:

```sh
PROVER_AGENT_COUNT=1
PROVER_AGENT_POLL_INTERVAL_MS=10000
PROVER_ID=<the address corresponding to the PROVER_PUBLISHER_PRIVATE_KEY you set on the node>
```

### Enable Auto-Update and Auto-Restart

The prover's auto-update functionality is critical for network coordination. This background module enables:

- Configuration updates across all nodes
- Automated image updates via controlled shutdowns
- Rapid hot-fix deployment
- Coordinated resets after governance upgrades

**Important**: Do NOT set `AUTO_UPDATE_URL` or `AUTO_UPDATE` environment variables. These must use their default values for proper operation.

Since Docker Compose doesn't respect pull policies on container restarts, install Watchtower for automatic updates:

```sh
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower
```

### Deploy with Docker Compose

Create a `docker-compose.yml` file in your `aztec-prover` directory with the following content:

```yml
name: aztec-prover
services:
  prover-node:
    image: aztecprotocol/aztec:latest
    entrypoint: >-
      node
      --no-warnings
      /usr/src/yarn-project/aztec/dest/bin/index.js
      start
      --prover-node
      --archiver
      --network testnet
    depends_on:
      prover-broker:
        condition: service_started
        required: true
    environment:
      DATA_DIRECTORY: /var/lib/data
      ETHEREUM_HOSTS: ${ETHEREUM_HOSTS}
      L1_CONSENSUS_HOST_URLS: ${L1_CONSENSUS_HOST_URLS}
      LOG_LEVEL: ${LOG_LEVEL}
      PROVER_BROKER_HOST: ${PROVER_BROKER_HOST}
      PROVER_PUBLISHER_PRIVATE_KEY: ${PROVER_PUBLISHER_PRIVATE_KEY}
      P2P_IP: ${P2P_IP}
      P2P_PORT: ${P2P_PORT}
      AZTEC_PORT: ${AZTEC_PORT}
    ports:
      - ${AZTEC_PORT}:${AZTEC_PORT}
      - ${P2P_PORT}:${P2P_PORT}
      - ${P2P_PORT}:${P2P_PORT}/udp
    volumes:
      - ${DATA_DIRECTORY}:/var/lib/data

  prover-broker:
    image: aztecprotocol/aztec:latest
    entrypoint: >-
      node
      --no-warnings
      /usr/src/yarn-project/aztec/dest/bin/index.js
      start
      --prover-broker
      --network testnet
    environment:
      DATA_DIRECTORY: /var/lib/data
      ETHEREUM_HOSTS: ${ETHEREUM_HOSTS}
      P2P_IP: ${P2P_IP}
      LOG_LEVEL: ${LOG_LEVEL}
    volumes:
      - ${PROVER_BROKER_DATA_DIRECTORY}:/var/lib/data

  prover-agent:
    image: aztecprotocol/aztec:latest
    entrypoint: >-
      node
      --no-warnings
      /usr/src/yarn-project/aztec/dest/bin/index.js
      start
      --prover-agent
      --network testnet
    environment:
      PROVER_AGENT_COUNT: ${PROVER_AGENT_COUNT}
      PROVER_AGENT_POLL_INTERVAL_MS: ${PROVER_AGENT_POLL_INTERVAL_MS}
      PROVER_BROKER_HOST: ${PROVER_BROKER_HOST}
      PROVER_ID: ${PROVER_ID}
    pull_policy: always
    restart: unless-stopped
```

**Note**: This configuration includes only essential settings. The `--network testnet` flag applies network-specific defaults. See the [CLI reference](../../reference/cli_reference.md) for all available options.

Start the prover:

```sh
docker compose up -d
```

## Verification

To verify your prover is running correctly:

1. Check that all services are running:

```sh
docker compose ps
```

2. View logs for each component:

```sh
# Prover node logs
docker compose logs -f prover-node

# Broker logs
docker compose logs -f prover-broker

# Agent logs
docker compose logs -f prover-agent
```
