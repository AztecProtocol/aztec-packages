---
title: Distributed Prover Setup
description: Distribute prover components across multiple machines for production deployments with Docker Compose.
---

## Overview

For production deployments, you can distribute the prover components across multiple machines for better performance and resource utilization. This setup is useful when you want to run multiple prover agents on separate high-performance machines, isolate the broker for better job queue management, or separate network-facing components (prover node) from compute-intensive components (agents).

## Architecture

In a distributed setup:
- **Prover Node**: Runs on a machine with network access and L1 connectivity
- **Prover Broker**: Can run on the same machine as the prover node or separately (must be accessible from prover agents)
- **Prover Agents**: Run on separate high-performance machines (32+ cores each, scalable with `PROVER_AGENT_COUNT`)

:::warning Network Requirements
Prover agents must communicate with the prover broker over the network. Ensure that:
- The broker machine's port 8080 is accessible from all agent machines
- Firewall rules allow traffic between agents and broker
- Network connectivity is stable and low-latency between components
:::

## Prerequisites

Before proceeding, ensure you have:

- Completed the [prerequisites](../prerequisites.md) for the Docker Compose method
- Multiple machines meeting hardware requirements for each component
- Network connectivity between all machines with appropriate firewall rules configured
- Generated an Ethereum private key for the prover publisher (see [Generating Keys](./running_a_prover.md#generating-keys) in the main guide)

## Prover Node and Broker Setup

On the machine that will run the prover node and broker:

### Step 1: Set Up Directory Structure

```bash
mkdir -p aztec-prover-node/prover-node-data aztec-prover-node/prover-broker-data
cd aztec-prover-node
touch .env
```

### Step 2: Configure Environment Variables

Add to your `.env` file:

```bash
# Prover Node Configuration
DATA_DIRECTORY=./prover-node-data
P2P_IP=[your external IP address]
P2P_PORT=40400
ETHEREUM_HOSTS=[your L1 execution endpoint]
L1_CONSENSUS_HOST_URLS=[your L1 consensus endpoint]
LOG_LEVEL=info
PROVER_BROKER_HOST=http://prover-broker:8080
PROVER_PUBLISHER_PRIVATE_KEY=[your prover publisher private key, see prerequisites]
AZTEC_PORT=8080
AZTEC_ADMIN_PORT=8880

# Prover Broker Configuration
PROVER_BROKER_DATA_DIRECTORY=./prover-broker-data
PROVER_BROKER_PORT=8080
```

### Step 3: Create Docker Compose File

Create `docker-compose.yml`:

```yaml
name: aztec-prover-node
services:
  prover-node:
    image: aztecprotocol/aztec:2.0.2
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
    image: aztecprotocol/aztec:2.0.2
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
    ports:
      - ${PROVER_BROKER_PORT}:8080
    volumes:
      - ${PROVER_BROKER_DATA_DIRECTORY}:/var/lib/data
    restart: unless-stopped
```

**Important:** The broker exposes port 8080 via `ports: - ${PROVER_BROKER_PORT}:8080`, making it accessible to external prover agents. Ensure this port is reachable from your agent machines.

This configuration includes only essential settings. The `--network testnet` flag applies network-specific defaults—see the [CLI reference](../reference/cli_reference.md) for all available configuration options.

### Step 4: Start Node and Broker

```bash
docker compose up -d
```

## Prover Agent Setup

On each machine that will run prover agents:

### Step 1: Set Up Directory

```bash
mkdir aztec-prover-agent
cd aztec-prover-agent
touch .env
```

### Step 2: Configure Environment Variables

Add to your `.env` file:

```bash
PROVER_AGENT_COUNT=1
PROVER_AGENT_POLL_INTERVAL_MS=10000
PROVER_BROKER_HOST=http://[BROKER_MACHINE_IP]:8080
PROVER_ID=[address corresponding to PROVER_PUBLISHER_PRIVATE_KEY]
```

Replace `[BROKER_MACHINE_IP]` with the IP address of the machine running the prover broker.

**Agent configuration tips:**
- Set `PROVER_AGENT_COUNT` based on your machine's hardware (e.g., 64 cores/256 GB RAM = 2 agents, 96 cores/384 GB RAM = 3 agents, 128 cores/512 GB RAM = 4 agents)
- Test connectivity before starting: `curl http://[BROKER_MACHINE_IP]:8080`
- If the curl test fails, check your network configuration, firewall rules, and ensure the broker is running

### Step 3: Create Docker Compose File

Create `docker-compose.yml`:

```yaml
name: aztec-prover-agent
services:
  prover-agent:
    image: aztecprotocol/aztec:2.0.2
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

### Step 4: Start Agent

```bash
docker compose up -d
```

**Scaling your prover capacity:**
- **Horizontal scaling**: Add more agent machines by repeating the agent setup on additional high-performance machines
- **Vertical scaling**: Increase `PROVER_AGENT_COUNT` on existing machines (ensure adequate hardware)

All agents, regardless of which machine they're on, must be able to communicate with the broker at the configured `PROVER_BROKER_HOST`.

## Next Steps

- Proceed to [Prover Verification and Troubleshooting](./prover_verification_troubleshooting.md) to verify your setup and troubleshoot any issues
- Consider [Single Machine Setup](./prover_single_machine.md) if you want to consolidate resources
- Monitor agent connectivity and job distribution across machines
