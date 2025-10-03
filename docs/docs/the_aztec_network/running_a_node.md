---
sidebar_position: 2
title: Running a Full Node
description: A comprehensive guide on how to run a full node on the Aztec network using either CLI or Docker Compose.
---

## Overview

This guide covers the steps required to run a full node on Aztec using either the CLI method or Docker Compose method.

:::tip Prerequisites
Before proceeding, ensure you've reviewed and completed the [prerequisites](./prerequisites.md) for your chosen deployment method.
:::

:::note
Both setup methods below include only essential settings. The `--network testnet` flag applies network-specific defaults. See the [CLI reference](./reference/cli_reference.md) for all available configuration options.
:::

## Setup with CLI

### Step 1: Configure the Node

Create a directory for node data:

```bash
mkdir aztec-node && cd ./aztec-node
```

Set the required configuration options. You can use environment variables or pass values directly to the command:

```bash
export AZTEC_NODE_NETWORK=testnet
export AZTEC_NODE_P2P_IP=<your external IP>
export AZTEC_NODE_ETH_HOSTS=<execution endpoint>
export AZTEC_NODE_CONSENSUS_HOSTS=<consensus endpoint>
```

:::tip
Find your public IP address with: `curl ipv4.icanhazip.com`
:::

### Step 2: Run the Node

Start the node:

```bash
aztec supervised-start --node --archiver --p2p.p2pIp $AZTEC_NODE_P2P_IP --network $AZTEC_NODE_NETWORK --l1-rpc-urls $AZTEC_NODE_ETH_HOSTS --l1-consensus-host-urls $AZTEC_NODE_CONSENSUS_HOSTS
```

## Setup with Docker Compose

### Step 1: Set Up Directory Structure

Create the directory structure for node data:

```bash
mkdir -p aztec-fullnode/data
cd aztec-fullnode
touch .env
```

### Step 2: Configure Environment Variables

Add the following to your `.env` file:

```bash
DATA_DIRECTORY=./data
LOG_LEVEL=info
ETHEREUM_HOSTS=<your L1 execution endpoint>
L1_CONSENSUS_HOST_URLS=<your L1 consensus endpoint>
P2P_IP=<your external IP address>
P2P_PORT=40400
AZTEC_PORT=8080
```

:::tip
Find your public IP address with: `curl ipv4.icanhazip.com`
:::

### Step 3: Create Docker Compose File

Create a `docker-compose.yml` file in your `aztec-fullnode` directory:

```yaml
services:
  aztec-node:
    image: "aztecprotocol/aztec:latest"
    container_name: "aztec-node"
    ports:
      - ${AZTEC_PORT}:${AZTEC_PORT}
      - ${P2P_PORT}:${P2P_PORT}
      - ${P2P_PORT}:${P2P_PORT}/udp
    volumes:
      - ${DATA_DIRECTORY}:/var/lib/data
    environment:
      DATA_DIRECTORY: /var/lib/data
      LOG_LEVEL: ${LOG_LEVEL}
      ETHEREUM_HOSTS: ${ETHEREUM_HOSTS}
      L1_CONSENSUS_HOST_URLS: ${L1_CONSENSUS_HOST_URLS}
      P2P_IP: ${P2P_IP}
      P2P_PORT: ${P2P_PORT}
      AZTEC_PORT: ${AZTEC_PORT}
    entrypoint: >-
      node
      --no-warnings
      /usr/src/yarn-project/aztec/dest/bin/index.js
      start
      --node
      --archiver
      --network testnet
    networks:
      - aztec
    restart: always

networks:
  aztec:
    name: aztec
```

### Step 4: Start the Node

Start the node:

```bash
docker compose up -d
```

## Verification

Once your node is running (via either method), verify it's working correctly:

### Check Node Sync Status

Check the current sync status:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
-d '{"jsonrpc":"2.0","method":"node_getL2Tips","params":[],"id":67}' \
http://localhost:8080 | jq -r ".result.proven.number"
```

Compare the output with block explorers like [Aztec Scan](https://aztecscan.xyz/) or [Aztec Explorer](https://aztecexplorer.xyz/).

### Check Node Status

```bash
curl http://localhost:8080/status
```

### Verify Port Connectivity

```bash
# Check TCP connectivity on port 40400
nc -vz <YOUR_EXTERNAL_IP> 40400
# Should return: "Connection to <YOUR_EXTERNAL_IP> 40400 port [tcp/*] succeeded!"

# Check UDP connectivity on port 40400
nc -vu <YOUR_EXTERNAL_IP> 40400
# Should return: "Connection to <YOUR_EXTERNAL_IP> 40400 port [udp/*] succeeded!"
```

### View Logs

**For CLI method:**

Logs will be displayed in the terminal where you ran the `aztec supervised-start` command.

**For Docker Compose method:**

```bash
docker compose logs -f aztec-node
```

Congrats! If all checks pass, your node should be up, running, and connected to the network.

## Troubleshooting

### Port forwarding not working

**Issue**: Your node cannot connect to peers.

**Solutions**:
- Verify your external IP address matches the `P2P_IP` setting
- Check firewall rules on your router and local machine
- Test connectivity using: `nc -zv <your-ip> 40400`

### Node not syncing

**Issue**: Your node is not synchronizing with the network.

**Solutions**:
- Check L1 endpoint connectivity
- Verify both execution and consensus clients are fully synced
- Review logs for specific error messages
- Ensure L1 endpoints support high throughput

### Docker issues

**Issue**: Container won't start or crashes (Docker Compose method only).

**Solutions**:
- Ensure Docker and Docker Compose are up to date
- Check disk space availability
- Verify the `.env` file is properly formatted
- Review container logs: `docker compose logs aztec-node`

## Next Steps

- Review [syncing best practices](./syncing_best_practices.md) for faster synchronization
- Learn about [bootnode operation](./bootnode_operation.md) for peer discovery
- Check the [CLI reference](./reference/cli_reference.md) for advanced configuration options
- Join the [Aztec Discord](https://discord.gg/aztec) for support and community discussions
