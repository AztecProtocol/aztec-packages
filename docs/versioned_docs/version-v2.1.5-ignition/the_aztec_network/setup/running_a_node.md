---
id: running_a_node
sidebar_position: 2
title: Running a Full Node
description: A comprehensive guide on how to run a full node on the Aztec network using Docker Compose.
---

## Overview

This guide covers the steps required to run a full node on Aztec using Docker Compose.

A full node allows you to connect and interact with the network, providing an interface to send and receive transactions and state updates without relying on third parties.

You should run your own full node if you want to interact with the network in the most privacy-preserving way. It's also a great way to support the Aztec network and get involved with the community.

### Minimum Hardware Requirements

- 8 core / 16 vCPU (released in 2015 or later)
- 16 GB RAM
- 1 TB NVMe SSD
- 25 Mbps network connection

These requirements are subject to change as the network throughput increases.

**Before proceeding:** Ensure you've reviewed and completed the [prerequisites](../prerequisites.md).

This setup includes only essential settings. The `--network mainnet` flag applies network-specific defaults—see the [CLI reference](../reference/cli_reference.md) for all available configuration options.

## Setup

### Step 1: Set Up Directory Structure

Create the directory structure for node data:

```bash
mkdir -p aztec-node/data
cd aztec-node
touch .env
```

### Step 2: Configure Environment Variables

Add the following to your `.env` file:

```bash
DATA_DIRECTORY=./data
LOG_LEVEL=info
ETHEREUM_HOSTS=[your L1 execution endpoint]
L1_CONSENSUS_HOST_URLS=[your L1 consensus endpoint]
P2P_IP=[your external IP address]
P2P_PORT=40400
AZTEC_PORT=8080
AZTEC_ADMIN_PORT=8880
```

:::tip
Find your public IP address with: `curl ipv4.icanhazip.com`
:::

### Step 3: Create Docker Compose File

Create a `docker-compose.yml` file in your `aztec-node` directory:

```yaml
services:
  aztec-node:
    image: "aztecprotocol/aztec:2.1.5"
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
      AZTEC_ADMIN_PORT: ${AZTEC_ADMIN_PORT}
    entrypoint: >-
      node
      --no-warnings
      /usr/src/yarn-project/aztec/dest/bin/index.js
      start
      --node
      --archiver
      --network mainnet
    networks:
      - aztec
    restart: always

networks:
  aztec:
    name: aztec
```

:::warning Security: Admin Port Not Exposed
The admin port (8880) is intentionally **not exposed** to the host machine for security reasons. The admin API provides sensitive operations like configuration changes and database rollbacks that should never be accessible from outside the container.

If you need to access admin endpoints, use `docker exec`:
```bash
docker exec -it aztec-node curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"nodeAdmin_getConfig","params":[],"id":1}'
```
:::

### Step 4: Start the Node

Start the node:

```bash
docker compose up -d
```

## Verification

Once your node is running, verify it's working correctly:

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
nc -vz [YOUR_EXTERNAL_IP] 40400
# Should return: "Connection to [YOUR_EXTERNAL_IP] 40400 port [tcp/*] succeeded!"

# Check UDP connectivity on port 40400
nc -vu [YOUR_EXTERNAL_IP] 40400
# Should return: "Connection to [YOUR_EXTERNAL_IP] 40400 port [udp/*] succeeded!"
```

### View Logs

```bash
docker compose logs -f aztec-node
```

If all checks pass, your node should be up, running, and connected to the network.

## Troubleshooting

### Port forwarding not working

**Issue**: Your node cannot connect to peers.

**Solutions**:

- Verify your external IP address matches the `P2P_IP` setting
- Check firewall rules on your router and local machine
- Test connectivity using: `nc -zv [your-ip] 40400`

### Node not syncing

**Issue**: Your node is not synchronizing with the network.

**Solutions**:

- Check L1 endpoint connectivity
- Verify both execution and consensus clients are fully synced
- Review logs for specific error messages
- Ensure L1 endpoints support high throughput

### Docker issues

**Issue**: Container won't start or crashes.

**Solutions**:

- Ensure Docker and Docker Compose are up to date
- Check disk space availability
- Verify the `.env` file is properly formatted
- Review container logs: `docker compose logs aztec-node`

## Next Steps

- Review [syncing best practices](./syncing_best_practices.md) for faster synchronization
- Learn about [bootnode operation](./bootnode_operation.md) for peer discovery
- Check the [CLI reference](../reference/cli_reference.md) for advanced configuration options
- Join the [Aztec Discord](https://discord.gg/aztec) for support and community discussions
