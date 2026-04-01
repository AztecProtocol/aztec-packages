---
title: Prerequisites
description: Common prerequisites and requirements for running nodes on the Aztec network, including hardware, software, and network configuration.
displayed_sidebar: operatorsSidebar
---

## Overview

This guide covers the prerequisites and setup requirements for running nodes on the Aztec network.

## Common Prerequisites

The following prerequisites apply to all node types.

### Operating System

The node software can be run on any Unix system released after 2020.

- Linux (common flavors)
- MacOS (ARM and intel)

### Docker and Docker Compose

Docker and Docker Compose are required for all node types. All Aztec nodes run in Docker containers managed by Docker Compose.

**On Linux:** Install Docker Engine and Docker Compose separately:

1. Install Docker:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

2. Add your user to the docker group so `sudo` is not needed:

```bash
sudo groupadd docker
sudo usermod -aG docker $USER
newgrp docker
# Test without sudo
docker run hello-world
```

3. Install Docker Compose by following the [Docker Compose installation guide](https://docs.docker.com/compose/install/).

**On macOS:** Install [Docker Desktop](https://docs.docker.com/desktop/install/mac-install/), which includes both Docker and Docker Compose.

### Aztec Toolchain

The Aztec toolchain provides CLI utilities for key generation, validator registration, and other operational tasks. While not required for running nodes (which use Docker Compose), it is needed for:

- Generating validator keystores and creating staking registration data (`aztec validator-keys`)
- Registering sequencers on L1 (`aztec add-l1-validator`)

Install the Aztec toolchain using the official installer:

```bash
bash -i <(curl -sL https://install.aztec.network)
```

Install the correct version for the current network:

```bash
aztec-up 3.0.3
```

### L1 Ethereum Node Access

All Aztec nodes require access to Ethereum L1 node endpoints:

- **Execution client endpoint** (e.g., Geth, Nethermind, Besu, Erigon)
- **Consensus client endpoint** (e.g., Prysm, Lighthouse, Teku, Nimbus)

**Options:**
1. **Run your own L1 node** (recommended for best performance):
   - Better performance and lower latency
   - No rate limiting or request throttling
   - Greater reliability and uptime control
   - Enhanced privacy for your node operations
   - See [Eth Docker's guide](https://ethdocker.com/Usage/QuickStart) for setup instructions

2. **Use a third-party RPC provider**:
   - Easier to set up initially
   - May have rate limits and throttling
   - Ensure the provider supports beacon apis

:::tip High Throughput Required
Your L1 endpoints must support high throughput to avoid degraded node performance.
:::

### Port Forwarding and Connectivity

For nodes participating in the P2P network (full nodes, sequencers, provers), proper port configuration is essential:

**Required steps:**
1. Configure your router to forward both UDP and TCP traffic on your P2P port (default: 40400) to your node's local IP address
2. Ensure your firewall allows traffic on the required ports:
   - P2P port: 40400 (default, both TCP and UDP)
   - HTTP API port: 8080 (default)
3. Set the `P2P_IP` environment variable to your external IP address
4. Verify the P2P port is accessible from the internet

**Find your public IP address:**

```bash
curl ipv4.icanhazip.com
```

**Verify port connectivity:**

```bash
# For TCP traffic on port 40400
nc -zv [YOUR_EXTERNAL_IP] 40400

# For UDP traffic on port 40400
nc -zuv [YOUR_EXTERNAL_IP] 40400
```

:::tip Port Forwarding Required
If port forwarding isn't properly configured, your node may not be able to participate in P2P duties.
:::

## Next Steps

Once you have met the prerequisites, proceed to set up your desired node type:

- [Run a Full Node →](./setup/running-a-node.md)
- [Run a Sequencer Node →](./setup/sequencer-setup.md)
- [Run a Prover Node →](./setup/running-a-prover.md)
