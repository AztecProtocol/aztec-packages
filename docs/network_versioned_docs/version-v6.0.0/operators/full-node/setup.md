---
id: setup
title: Full node setup
description: How to run a full node on the Aztec network using Docker Compose.
displayed_sidebar: operatorsSidebar
references: ["labs/yarn-project/aztec/src/cli/cmds/start_node.ts", "labs/yarn-project/aztec/src/cli/aztec_start_options.ts", "labs/yarn-project/ethereum/src/config.ts", "labs/yarn-project/p2p/src/config.ts"]
---

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
# Optional: only set ETHEREUM_DEBUG_HOSTS if your trace-capable endpoint is different from ETHEREUM_HOSTS.
# If left unset, the node uses ETHEREUM_HOSTS for trace calls. See the note below.
ETHEREUM_DEBUG_HOSTS=[a separate trace-capable L1 endpoint, if you have one]
P2P_IP=[your external IP address]
P2P_PORT=40400
AZTEC_PORT=8080
AZTEC_ADMIN_PORT=8880
```

:::tip
Find your public IP address with: `curl ipv4.icanhazip.com`
:::

:::warning Trace-capable L1 endpoint required
The node needs an L1 execution endpoint that serves `trace_transaction` or `debug_traceTransaction`. A checkpoint published through a non-standard contract, rather than by a direct call to the rollup, cannot be read from the transaction calldata alone. The node traces that transaction to recover the checkpoint, and without a trace it stops syncing at that checkpoint.

Set `ETHEREUM_DEBUG_HOSTS` to your trace-capable endpoint. If you leave it unset, the node uses `ETHEREUM_HOSTS` for trace calls. The node only uses `ETHEREUM_DEBUG_HOSTS` for traces, not for regular L1 interactions.

At startup the node checks that it can trace a recent L1 transaction on that endpoint, and refuses to start if neither method works. To start anyway, set `ETHEREUM_ALLOW_NO_DEBUG_HOSTS=true`. The node then logs a warning and runs, but stalls on the first checkpoint it cannot read until you point it at a trace-capable endpoint and restart it.
:::

### Step 3: Create Docker Compose File

Create a `docker-compose.yml` file in your `aztec-node` directory:

```yaml
services:
  aztec-node:
    image: "azteclabs/aztec:6.0.0"
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
      ETHEREUM_DEBUG_HOSTS: ${ETHEREUM_DEBUG_HOSTS}
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
  -H 'x-api-key: [ADMIN_API_KEY]' \
  -d '{"jsonrpc":"2.0","method":"nodeAdmin_getConfig","params":[],"id":1}'
```

The admin API requires an API key by default. The node generates one at first startup and prints it once to the logs; pass it with the `x-api-key` header (or `Authorization: Bearer [ADMIN_API_KEY]`). See [admin API key authentication](../reference/changelog/v4.md#admin-api-key-authentication).
:::

### Step 4: Start the Node

Start the node:

```bash
docker compose up -d
```
