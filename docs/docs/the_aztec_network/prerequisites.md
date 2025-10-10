---
id: prerequisites
sidebar_position: 1
title: Prerequisites
description: Common prerequisites and requirements for running nodes on the Aztec network, including hardware, software, and network configuration.
---

## Overview

This guide covers the prerequisites and setup requirements for running nodes on the Aztec network.

## Common Prerequisites

The following prerequisites apply to all node types and deployment methods.

### Operating System

This guide assumes you're using a standard Linux distribution such as Debian or Ubuntu. While other operating systems may work, these instructions are tested and optimized for Linux environments.

### Docker

**Docker is required for all node types and deployment methods.**

If not already installed, here is a convenient way to install it on Linux:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

After installation, add your user to the docker group so `sudo` is not needed:

```bash
sudo groupadd docker
sudo usermod -aG docker $USER
newgrp docker
# Test without sudo
docker run hello-world
```

### L1 Ethereum Node Access

All Aztec nodes require access to Ethereum L1 node endpoints:

- **Execution client endpoint** (e.g., Geth, Nethermind, Besu, Erigon)
- **Consensus client endpoint** (e.g., Prysm, Lighthouse, Teku, Nimbus)

:::warning Sepolia Testnet Required
Both options below must be connected to Sepolia testnet, as the Aztec testnet runs on Ethereum Sepolia.
:::

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
   - Ensure the provider supports high throughput

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

### Auto-Updates

The auto-update functionality is critical for network coordination and enables:
- Configuration updates across all nodes
- Automated image updates via controlled shutdowns
- Rapid hot-fix deployment
- Coordinated resets after governance upgrades

**Important:** Do not manually set `AUTO_UPDATE_URL` or `AUTO_UPDATE` environment variables. These must use their default values for proper operation.

## Deployment Methods

There are two methods to run Aztec nodes, each with different additional requirements.

### Method 1: CLI Method

Run nodes directly on your host using the Aztec CLI tools.

**Best for:**
- Quick setup and testing
- Full nodes
- Development environments

**Additional requirements:**
- Aztec toolchain installation

**Used by:**
- [Full node guide](./setup/running_a_node.md)

### Method 2: Docker Compose Method

Run nodes using Docker containers managed by Docker Compose.

**Best for:**
- Production deployments
- Sequencer nodes
- Prover nodes
- Multi-container setups

**Additional requirements:**
- Docker Compose
- Watchtower (for auto-updates)

**Does NOT require:**
- Aztec toolchain

**Used by:**
- [Full node guide](./setup/running_a_node.md)
- [Sequencer guide](./setup/sequencer_management)
- [Prover guide](./setup/running_a_prover.md)

## Method-Specific Prerequisites

### CLI Method: Additional Requirements

If you're using the CLI method to run nodes, install the following **in addition to the common prerequisites**:

#### Aztec Toolchain

Install the Aztec toolchain using the official installer:

```bash
bash -i <(curl -s https://install.aztec.network)
```

Verify installation:

```bash
ls ~/.aztec/bin
# Should show: aztec, aztec-up, aztec-nargo, and aztec-wallet
```

Add Aztec to your PATH:

```bash
echo 'export PATH="$HOME/.aztec/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Install the correct version for the current testnet:

```bash
aztec-up v#include_testnet_version
```

Verify the version:

```bash
aztec --version
```

### Docker Compose Method: Additional Requirements

If you're using Docker Compose to run nodes, install the following **in addition to the common prerequisites**:

#### Docker Compose

Docker Compose is required for managing multi-container node setups.

Installation guide: [https://docs.docker.com/compose/install/](https://docs.docker.com/compose/install/)

#### Watchtower

Since Docker Compose doesn't respect pull policies on container restarts, install Watchtower for automatic Docker image updates:

```bash
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower
```

**Note:** The Docker Compose method pulls the Aztec node software directly from the `aztecprotocol/aztec:#include_testnet_version` Docker image. You do NOT need to install the Aztec toolchain on your host machine.

## Next Steps

Once you have met the prerequisites for your chosen method, proceed to set up your desired node type:

- [Run a Full Node →](./setup/running_a_node.md) (CLI Method)
- [Run a Sequencer Node →](./setup/sequencer_management) (Docker Compose Method)
- [Run a Prover Node →](./setup/running_a_prover.md) (Docker Compose Method)
