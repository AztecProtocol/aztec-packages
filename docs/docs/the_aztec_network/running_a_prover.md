---
sidebar_position: 4
title: Running a Prover
description: A comprehensive guide on how to run an Aztec prover on the network using Docker Compose in single-machine or distributed configurations.
---

## Overview

This guide covers the steps required to run a prover on the Aztec network. Operating a prover is a resource-intensive role typically undertaken by experienced engineers due to its technical complexity and hardware requirements.

Aztec provers are critical infrastructure components that generate cryptographic proofs attesting to transaction correctness, ultimately producing a single rollup proof submitted to Ethereum.

:::tip Prerequisites
Before proceeding, ensure you've reviewed and completed the [prerequisites](./prerequisites.md) for the Docker Compose method.
:::

## Prover Architecture

The prover consists of three main components:

1. **Prover node**: Polls L1 for unproven epochs, creates prover jobs, distributes them to the broker, and submits the final rollup proof to the rollup contract.

2. **Prover broker**: Manages the job queue, distributing work to agents and collecting results.

3. **Prover agent(s)**: Executes proof generation jobs in a stateless manner.

## Minimum Requirements

### Prover Node

- 2 core / 4 vCPU (released in 2015 or later)
- 16 GB RAM
- 1 TB NVMe SSD
- 25 Mbps network connection

### Prover Broker

- 2 core / 4 vCPU (released in 2015 or later)
- 16 GB RAM
- 10 GB SSD

### Prover Agents

**For each agent:**
- 32 core / 64 vCPU (released in 2015 or later)
- 128 GB RAM
- 10 GB SSD

:::note
These requirements are subject to change as the network throughput increases. Prover agents require high-performance hardware, typically data center-grade infrastructure.
:::

:::tip Running Multiple Agents
A single machine can run multiple prover agents by adjusting the `PROVER_AGENT_COUNT` configuration. Hardware requirements scale approximately linearly with the number of agents:
- **2 agents**: 64 cores, 256 GB RAM
- **3 agents**: 96 cores, 384 GB RAM
- **4 agents**: 128 cores, 512 GB RAM

This scaling applies to both single-machine and distributed setups. Consider your available hardware when deciding how many agents to run per machine.
:::

## Single Machine Setup with Docker Compose

This setup runs all prover components on a single machine. Your hardware must meet or exceed the prover agent requirements multiplied by your desired `PROVER_AGENT_COUNT`.

:::note
This configuration includes only essential settings. The `--network testnet` flag applies network-specific defaults. See the [CLI reference](./reference/cli_reference.md) for all available configuration options.
:::

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
P2P_IP=<your external IP address>
P2P_PORT=40400
ETHEREUM_HOSTS=<your L1 execution endpoint, or a comma separated list if you have multiple>
L1_CONSENSUS_HOST_URLS=<your L1 consensus endpoint, or a comma separated list if you have multiple>
LOG_LEVEL=info
PROVER_BROKER_HOST=http://prover-broker:8080
PROVER_PUBLISHER_PRIVATE_KEY=<the private key of the L1 EOA your prover will publish proofs from>
AZTEC_PORT=8080

# Prover Broker Configuration
PROVER_BROKER_DATA_DIRECTORY=./prover-broker-data

# Prover Agent Configuration
PROVER_AGENT_COUNT=1
PROVER_AGENT_POLL_INTERVAL_MS=10000
PROVER_ID=<the address corresponding to the PROVER_PUBLISHER_PRIVATE_KEY you set on the node>
```

:::tip
- Find your public IP address with: `curl ipv4.icanhazip.com`
- Adjust `PROVER_AGENT_COUNT` based on your available hardware. For example, with 128 cores and 512 GB RAM, you could set `PROVER_AGENT_COUNT=4`
:::

### Step 3: Create Docker Compose File

Create a `docker-compose.yml` file in your `aztec-prover` directory:

```yaml
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
    restart: unless-stopped

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
    restart: unless-stopped

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
    restart: unless-stopped
```

### Step 4: Start the Prover

Start all prover components:

```bash
docker compose up -d
```

## Distributed Setup with Docker Compose

For production deployments, you can distribute the prover components across multiple machines for better performance and resource utilization. This is especially useful when you want to:

- Run multiple prover agents on separate high-performance machines
- Isolate the broker for better job queue management
- Separate network-facing components (prover node) from compute-intensive components (agents)

### Architecture Overview

In a distributed setup:
- **Prover Node**: Runs on a machine with network access and L1 connectivity
- **Prover Broker**: Can run on the same machine as the prover node or separately (must be accessible from prover agents)
- **Prover Agents**: Run on separate high-performance machines (32+ cores each, scalable with `PROVER_AGENT_COUNT`)

:::warning Network Requirements
**Critical**: Prover agents must be able to communicate with the prover broker over the network. Ensure:
- The broker machine's port 8080 is accessible from all agent machines
- Firewall rules allow traffic between agents and broker
- Network connectivity is stable and low-latency between components
- If using multiple networks, ensure proper routing between prover node, broker, and agents
:::

### Prover Node and Broker Setup

On the machine that will run the prover node and broker:

#### Step 1: Set Up Directory Structure

```bash
mkdir -p aztec-prover-node/prover-node-data aztec-prover-node/prover-broker-data
cd aztec-prover-node
touch .env
```

#### Step 2: Configure Environment Variables

Add to your `.env` file:

```bash
# Prover Node Configuration
DATA_DIRECTORY=./prover-node-data
P2P_IP=<your external IP address>
P2P_PORT=40400
ETHEREUM_HOSTS=<your L1 execution endpoint>
L1_CONSENSUS_HOST_URLS=<your L1 consensus endpoint>
LOG_LEVEL=info
PROVER_BROKER_HOST=http://prover-broker:8080
PROVER_PUBLISHER_PRIVATE_KEY=<your private key>
AZTEC_PORT=8080

# Prover Broker Configuration
PROVER_BROKER_DATA_DIRECTORY=./prover-broker-data
PROVER_BROKER_PORT=8080
```

#### Step 3: Create Docker Compose File

Create `docker-compose.yml`:

```yaml
name: aztec-prover-node
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
    restart: unless-stopped

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
    ports:
      - ${PROVER_BROKER_PORT}:8080
    volumes:
      - ${PROVER_BROKER_DATA_DIRECTORY}:/var/lib/data
    restart: unless-stopped
```

:::important
Note that the broker exposes port 8080 via `ports: - ${PROVER_BROKER_PORT}:8080`. This makes the broker accessible to external prover agents. Ensure this port is reachable from your agent machines.
:::

#### Step 4: Start Node and Broker

```bash
docker compose up -d
```

### Prover Agent Setup

On each machine that will run prover agents:

#### Step 1: Set Up Directory

```bash
mkdir aztec-prover-agent
cd aztec-prover-agent
touch .env
```

#### Step 2: Configure Environment Variables

Add to your `.env` file:

```bash
PROVER_AGENT_COUNT=1
PROVER_AGENT_POLL_INTERVAL_MS=10000
PROVER_BROKER_HOST=http://<BROKER_MACHINE_IP>:8080
PROVER_ID=<the address corresponding to your PROVER_PUBLISHER_PRIVATE_KEY>
```

Replace `<BROKER_MACHINE_IP>` with the IP address of the machine running the prover broker.

:::tip Adjusting Agent Count
Set `PROVER_AGENT_COUNT` based on your machine's available hardware:
- **64 cores, 256 GB RAM**: `PROVER_AGENT_COUNT=2`
- **96 cores, 384 GB RAM**: `PROVER_AGENT_COUNT=3`
- **128 cores, 512 GB RAM**: `PROVER_AGENT_COUNT=4`

Hardware requirements scale approximately linearly with the number of agents.
:::

:::tip Testing Connectivity
Before starting the agent, verify it can reach the broker:
```bash
curl http://<BROKER_MACHINE_IP>:8080
```
If this fails, check your network configuration, firewall rules, and ensure the broker is running.
:::

#### Step 3: Create Docker Compose File

Create `docker-compose.yml`:

```yaml
name: aztec-prover-agent
services:
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
    restart: unless-stopped
```

#### Step 4: Start Agent

```bash
docker compose up -d
```

:::tip Scaling Agents
You can scale your prover capacity in two ways:
1. **Horizontal scaling**: Add more agent machines by repeating the agent setup on additional high-performance machines
2. **Vertical scaling**: Increase `PROVER_AGENT_COUNT` on existing machines (ensure adequate hardware)

All agents, regardless of which machine they're on, must be able to communicate with the broker at the configured `PROVER_BROKER_HOST`.
:::

## Verification

Once your prover is running, verify all components are working correctly:

### Check Services

**For single machine setup:**

```bash
docker compose ps
```

**For distributed setup:**

On the prover node machine:
```bash
docker compose ps
```

On each agent machine:
```bash
docker compose ps
```

### View Logs

**Single machine setup:**

```bash
# Prover node logs
docker compose logs -f prover-node

# Broker logs
docker compose logs -f prover-broker

# Agent logs
docker compose logs -f prover-agent
```

**Distributed setup:**

On prover node machine:
```bash
# Prover node logs
docker compose logs -f prover-node

# Broker logs
docker compose logs -f prover-broker
```

On agent machines:
```bash
# Agent logs
docker compose logs -f prover-agent
```

## Troubleshooting

### Components not communicating

**Issue**: Prover agent cannot connect to broker in distributed setup.

**Solutions**:
- Verify the broker IP address in `PROVER_BROKER_HOST` is correct
- Ensure port 8080 on the broker machine is accessible from agent machines
- Check firewall rules between machines allow traffic on port 8080
- Test connectivity from agent machine: `curl http://<BROKER_IP>:8080`
- Verify the broker container is running: `docker compose ps`
- Check if the broker port is exposed in docker-compose.yml
- Review broker logs for connection attempts: `docker compose logs prover-broker`

### Insufficient resources

**Issue**: Prover agent crashes or performs poorly.

**Solutions**:
- Verify your hardware meets the minimum requirements (32 cores × `PROVER_AGENT_COUNT`, 128GB RAM × `PROVER_AGENT_COUNT`)
- Check system resource usage: `docker stats`
- Reduce `PROVER_AGENT_COUNT` if running multiple agents per machine
- Ensure no other resource-intensive processes are running
- Monitor CPU and memory usage to verify resources match your configured agent count

### Agent not picking up jobs

**Issue**: Agent logs show no job activity.

**Solutions**:
- Verify the broker is receiving jobs from the prover node
- Check broker logs for errors
- Confirm `PROVER_ID` matches your publisher address
- Ensure agent can reach the broker endpoint
- Test broker connectivity: `curl http://<BROKER_IP>:8080`

### Docker issues

**Issue**: Containers won't start or crash repeatedly.

**Solutions**:
- Ensure Docker and Docker Compose are up to date
- Check disk space availability on all machines
- Verify `.env` files are properly formatted
- Review logs for specific error messages

### Common Issues

See the [Operator FAQ](./reference/operator_faq.md) for additional common issues and resolutions.

## Next Steps

- Monitor your prover's performance and proof submission rate
- Consider adding more prover agents for increased capacity (either by increasing `PROVER_AGENT_COUNT` or adding more machines)
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support
- Review [reacting to upgrades](./reference/reacting_to_upgrades.md) for handling network upgrades
