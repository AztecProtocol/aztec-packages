---
title: Single Machine Prover Setup
description: Run all prover components on a single high-performance machine using Docker Compose.
---

## Overview

This setup runs all prover components (prover node, broker, and agents) on a single machine using Docker Compose. Your hardware must meet or exceed the prover agent requirements multiplied by your desired `PROVER_AGENT_COUNT`.

## Prerequisites

Before proceeding, ensure you have:

- Completed the [prerequisites](../prerequisites.md) for the Docker Compose method
- Hardware that meets minimum requirements for all components combined (for multiple agents, multiply agent requirements by `PROVER_AGENT_COUNT`)
- Generated an Ethereum private key for the prover publisher (see [Generating Keys](./running_a_prover.md#generating-keys) in the main guide)

## Setup Steps

### Step 1: Set Up Directory Structure

Create the directory structure for prover data storage:

```bash
mkdir -p aztec-prover/prover-node-data aztec-prover/prover-broker-data
cd aztec-prover
touch .env
```

### Step 2: Configure Environment Variables

Add the following to your `.env` file:

```bash
# Prover Node Configuration
DATA_DIRECTORY=./prover-node-data
P2P_IP=[your external IP address]
P2P_PORT=40400
ETHEREUM_HOSTS=[your L1 execution endpoint, or a comma separated list if you have multiple]
L1_CONSENSUS_HOST_URLS=[your L1 consensus endpoint, or a comma separated list if you have multiple]
LOG_LEVEL=info
PROVER_BROKER_HOST=http://prover-broker:8080
PROVER_PUBLISHER_PRIVATE_KEY=[your prover publisher private key, see prerequisites]
AZTEC_PORT=8080
AZTEC_ADMIN_PORT=8880

# Prover Broker Configuration
PROVER_BROKER_DATA_DIRECTORY=./prover-broker-data

# Prover Agent Configuration
PROVER_AGENT_COUNT=1
PROVER_AGENT_POLL_INTERVAL_MS=10000
PROVER_ID=[address corresponding to PROVER_PUBLISHER_PRIVATE_KEY]
```

**Configuration notes:**
- Find your public IP address with: `curl ipv4.icanhazip.com`
- Adjust `PROVER_AGENT_COUNT` based on your available hardware (e.g., with 128 cores and 512 GB RAM, you could set `PROVER_AGENT_COUNT=4`)

### Step 3: Create Docker Compose File

Create a `docker-compose.yml` file in your `aztec-prover` directory:

```yaml
name: aztec-prover
services:
  prover-node:
    image: aztecprotocol/aztec:#include_testnet_version
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
      AZTEC_ADMIN_PORT: ${AZTEC_ADMIN_PORT}
    ports:
      - ${AZTEC_PORT}:${AZTEC_PORT}
      - ${AZTEC_ADMIN_PORT}:${AZTEC_ADMIN_PORT}
      - ${P2P_PORT}:${P2P_PORT}
      - ${P2P_PORT}:${P2P_PORT}/udp
    volumes:
      - ${DATA_DIRECTORY}:/var/lib/data
    restart: unless-stopped

  prover-broker:
    image: aztecprotocol/aztec:#include_testnet_version
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
    restart: unless-stopped

  prover-agent:
    image: aztecprotocol/aztec:#include_testnet_version
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
    restart: unless-stopped
```

This configuration includes only essential settings. The `--network testnet` flag applies network-specific defaults—see the [CLI reference](../reference/cli_reference.md) for all available configuration options.

### Step 4: Start the Prover

Start all prover components:

```bash
docker compose up -d
```

## Next Steps

- Proceed to [Prover Verification and Troubleshooting](./prover_verification_troubleshooting.md) to verify your setup and troubleshoot any issues
- Consider [Distributed Setup](./prover_distributed.md) if you need to scale across multiple machines
- Monitor your prover's performance and resource usage
