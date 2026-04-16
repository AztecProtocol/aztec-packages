---
id: running_an_rpc_provider
displayed_sidebar: operatorsSidebar
title: Running an RPC Provider
description: Run an Aztec node as an RPC endpoint so your app's users can interact with the network without relying on third-party providers.
references: ["yarn-project/aztec/src/cli/cmds/start_node.ts"]
---

## Overview

This guide covers how to run an Aztec full node as an **RPC provider** — an endpoint your application's users connect to for sending transactions, querying state, and interacting with the Aztec network.

Running your own RPC provider means you don't depend on third-party RPC services for network access. This is especially useful when:

- Third-party providers have reliability issues or rate limits
- You want full control over your app's network connectivity
- You need lower latency or higher throughput for your users
- You want to support the network's decentralization

A node configured as an RPC provider runs in **non-validator mode** — it syncs the chain, serves the JSON-RPC API, and participates in P2P gossip, but does not propose or attest to blocks.

### Minimum Hardware Requirements

- 8 core / 16 vCPU (released in 2015 or later)
- 16 GB RAM
- 1 TB NVMe SSD
- 25 Mbps network connection

**Before proceeding:** Ensure you've reviewed and completed the [prerequisites](../prerequisites.md).

## Setup

### Step 1: Set Up Directory Structure

```bash
mkdir -p aztec-rpc/data
cd aztec-rpc
```

### Step 2: Configure Environment Variables

Create a `.env` file:

```bash
# === Required ===
# L1 Ethereum execution client RPC URL (e.g. Alchemy, Infura, or your own node)
ETHEREUM_HOSTS=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY

# L1 consensus (beacon) client URL
L1_CONSENSUS_HOST_URLS=https://ethereum-beacon-api.publicnode.com

# Your server's external IP (run: curl ipv4.icanhazip.com)
P2P_IP=YOUR_EXTERNAL_IP

# === Optional (defaults shown) ===
DATA_DIRECTORY=./data
LOG_LEVEL=info
AZTEC_PORT=8080
P2P_PORT=40400
```

:::tip
For **Ignition (Mainnet)**, use L1 Mainnet endpoints (chain ID 1).
For **Testnet**, use L1 Sepolia endpoints (chain ID 11155111).
:::

### Step 3: Create Docker Compose File

Create a `docker-compose.yml` file:

```yaml
services:
  aztec-rpc:
    image: "aztecprotocol/aztec:#release_version"
    container_name: "aztec-rpc"
    ports:
      # JSON-RPC API — this is the endpoint your app connects to
      - "${AZTEC_PORT:-8080}:${AZTEC_PORT:-8080}"
      # P2P networking (required for syncing)
      - "${P2P_PORT:-40400}:${P2P_PORT:-40400}"
      - "${P2P_PORT:-40400}:${P2P_PORT:-40400}/udp"
    volumes:
      - ${DATA_DIRECTORY:-./data}:/var/lib/data
    environment:
      DATA_DIRECTORY: /var/lib/data
      LOG_LEVEL: ${LOG_LEVEL:-info}
      ETHEREUM_HOSTS: ${ETHEREUM_HOSTS}
      L1_CONSENSUS_HOST_URLS: ${L1_CONSENSUS_HOST_URLS:-}
      ETHEREUM_DEBUG_HOSTS: ${ETHEREUM_DEBUG_HOSTS:-}
      P2P_IP: ${P2P_IP}
      P2P_PORT: ${P2P_PORT:-40400}
      AZTEC_PORT: ${AZTEC_PORT:-8080}
      VALIDATOR_DISABLED: "true"
    entrypoint: >-
      node
      --no-warnings
      /usr/src/yarn-project/aztec/dest/bin/index.js
      start
      --node
      --archiver
      --network #release_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${AZTEC_PORT:-8080}/status"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    restart: always

networks:
  default:
    name: aztec-rpc
```

:::warning Security: Admin Port Not Exposed
The admin port (8880) is intentionally **not exposed** to the host machine. The admin API provides sensitive operations like configuration changes and database rollbacks that should never be publicly accessible.
:::

### Step 4: Start the Node

```bash
docker compose up -d
```

### Step 5: Verify It's Working

Wait a few minutes for the node to start syncing, then check its status:

```bash
# Check node status
curl http://localhost:8080/status

# Check sync progress
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getL2Tips","params":[],"id":1}' \
  http://localhost:8080 | jq -r ".result.proven.number"
```

Compare the block number with a [block explorer](/networks) to verify your node is syncing.

## Connecting Your Application

Once synced, your app can connect to your node's JSON-RPC endpoint:

```typescript
import { createAztecNodeClient } from "@aztec/aztec.js";

const node = createAztecNodeClient("http://YOUR_SERVER_IP:8080");
const blockNumber = await node.getBlockNumber();
```

If your node is on the same machine as your app, use `http://localhost:8080`. For remote access, use the server's IP address or domain name.

## Adding HTTPS with a Reverse Proxy

For production deployments, put the RPC endpoint behind a reverse proxy with TLS. Here's an example using Caddy:

Add a `Caddyfile` to your `aztec-rpc` directory:

```
your-rpc.example.com {
    reverse_proxy aztec-rpc:8080
}
```

Update `docker-compose.yml` to add the Caddy service:

```yaml
services:
  aztec-rpc:
    # ... (same as above, but remove the AZTEC_PORT from ports since Caddy handles it)
    ports:
      - "${P2P_PORT:-40400}:${P2P_PORT:-40400}"
      - "${P2P_PORT:-40400}:${P2P_PORT:-40400}/udp"
    # ... rest of config unchanged

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on:
      - aztec-rpc

volumes:
  caddy_data:
```

Caddy automatically provisions TLS certificates via Let's Encrypt. Your app then connects to `https://your-rpc.example.com`.

## Available JSON-RPC Methods

Your RPC provider exposes the full Aztec node JSON-RPC API. Key methods for app developers:

| Method | Description |
|--------|-------------|
| `node_getBlockNumber` | Latest block number |
| `node_getBlock` | Get block by number or hash |
| `node_getL2Tips` | Latest proven and pending block numbers |
| `node_sendTx` | Submit a transaction |
| `node_getTxReceipt` | Get transaction receipt |
| `node_getTxEffect` | Get transaction effect with block info |
| `node_getNodeInfo` | Node version, chain ID, protocol version |
| `node_getL1ContractAddresses` | L1 contract addresses |
| `node_getProtocolContractAddresses` | L2 protocol contract addresses |
| `node_getPublicStorageAt` | Read public contract storage |
| `node_getContract` | Get contract instance |
| `node_getContractClass` | Get contract class |
| `node_simulatePublicCalls` | Simulate public function calls |
| `node_getCurrentMinFees` | Current gas fees |

See the [Node API Reference](../reference/node-api-reference.md) for the complete list.

## Monitoring

### Docker Healthcheck

The compose file includes a healthcheck that pings the `/status` endpoint. Check health with:

```bash
docker inspect --format='{{.State.Health.Status}}' aztec-rpc
```

### Logs

```bash
docker compose logs -f aztec-rpc
```

### OpenTelemetry (Optional)

For production monitoring, add the `otel-lgtm` stack to get metrics, traces, and a Grafana dashboard. See the [Monitoring Guide](../monitoring/index.md) for details.

## Troubleshooting

### Node not syncing

- Verify your L1 RPC endpoint is working: `curl -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' $ETHEREUM_HOSTS`
- Check that P2P ports (40400 TCP+UDP) are accessible from the internet
- Review logs for errors: `docker compose logs aztec-rpc | tail -100`

### RPC endpoint not responding

- Confirm the container is running: `docker compose ps`
- Check the healthcheck status: `docker inspect --format='{{.State.Health.Status}}' aztec-rpc`
- The node may still be starting up — initial sync can take time

### High resource usage

- Check disk space: `df -h` — the node stores chain data
- Monitor memory: `docker stats aztec-rpc`
- Consider adjusting `LOG_LEVEL` to `warn` in production to reduce I/O

## Next Steps

- Review [syncing best practices](./syncing-best-practices.md) for faster synchronization
- Set up [monitoring](../monitoring/index.md) for production visibility
- Check the [CLI reference](../reference/cli-reference.md) for advanced configuration options
