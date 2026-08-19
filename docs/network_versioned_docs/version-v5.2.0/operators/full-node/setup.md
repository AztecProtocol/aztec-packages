---
id: setup
title: Full node setup
description: How to run a full node on the Aztec network using Docker Compose.
displayed_sidebar: operatorsSidebar
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

:::warning
In order to retrieve blocks posted to L1 via non-standard contract interactions, it is necessary to have access to an L1 rpc endpoint with 'trace' capability (either `trace_transaction` or `debug_traceTransaction`). The variable `ETHEREUM_DEBUG_HOSTS` is used to provide these url/s to the node. If not provided, the value of this will default to that set in `ETHEREUM_HOSTS`. The node will validate whether it is able to execute a trace call on the provided url/s, if not, it looks to the value set in `ETHEREUM_ALLOW_NO_DEBUG_HOSTS` to determine whether this should prevent the node from starting. By default `ETHEREUM_ALLOW_NO_DEBUG_HOSTS` is `true`, allowing the node to start. Any url provided in `ETHEREUM_DEBUG_HOSTS` will only be used in the case of having to execute a trace, it won't be used in regular L1 interactions.

Note - if the node does not have access to an rpc url that is capable of trace calls and it encounters a block posted via a transaction using non-standard contract interactions, it may become stuck and unable to progress the chain.
:::

### Step 3: Create Docker Compose File

Create a `docker-compose.yml` file in your `aztec-node` directory:

```yaml
services:
  aztec-node:
    image: "aztecprotocol/aztec:5.2.0"
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
