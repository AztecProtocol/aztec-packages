---
sidebar_position: 0
title: How to run validator node
---

## Introduction

This guide provides step-by-step instructions on how to set up an Aztec Layer 2 validator node. Running a node allows you to participate in the Aztec network as a validator (also known as a sequencer or proposer), contributing to the network's security and decentralization.

The use of Docker means that the environment is set up in a way that works in a variety of environments. For complex deployments with load balancing (for validator redundancy to maximize liveness) there are helm charts available for use with kubernetes (with the same images).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Port Forwarding](#port-forwarding)
3. [Setting Up on Ubuntu 24](#setting-up-on-ubuntu-24)
4. [Setting Up on Other Operating Systems](#setting-up-on-other-operating-systems)
5. [Configuring Deployment](#configuring-deployment)
6. [Troubleshooting](#troubleshooting)
7. [Background Knowledge](#background-knowledge)

---

## Prerequisites

- **Operating System**: One of the following
  - Ubuntu 24.04 LTS
  - macOS
  - Windows
- **Knowledge**: Basic familiarity with running commands on a command-line interface.
- **Hardware Requirements**:

```
  🖥️        Minimum         Recommended
|---------|---------------|----------------|
| CPU     | 16 cores      | 32 cores       |
| Network | 32 mb/s       | 128 mb/s       |
| Storage | 3 TB          | 5 TB           |
| RAM     | 32 GB         | 64 GB          |
```

## Port Forwarding

### Understanding Port Forwarding

Port forwarding allows external devices to access services on a private network by mapping an external port to an internal IP address and port. It's crucial for your Aztec node to communicate with other nodes in the network and form a decentralized peer network. You will need one open UDP port per validator instance you wish to run (even if they are on the same computer).

- **Reference Guide**: [How to Set Up Port Forwarding on a Router](https://www.noip.com/support/knowledgebase/general-port-forwarding-guide/)
- If using a cloud provider, use security groups (for AWS) or a similar capability to configure open UDP ports on your server.

### When Port Forwarding Is Not Possible

Port forwarding may not be possible under certain conditions:

- **ISP Restrictions**: Some Internet Service Providers (ISPs) block port forwarding.
- **Network Limitations**: If you're on a public or corporate network without router access.

#### Workarounds

For example, a restrictive setup like hotel Wi-Fi would require the use of a VPN, using `socat` into a port-forwarded computer, or just using a cloud instance directly with instructions above. Note: It may be possible to use a P2P relay service that works with the DiscV5 protocol, but it is currently untested.

## Setting Up on Ubuntu 24

**Note**: The scripts mentioned here do not currently work on ARM architectures. Support for ARM will be added in the future.

### Updating the System

Open your terminal and update your package list:

```bash
sudo apt update
```

### Installing Docker

Install Docker to manage containerized applications:

```bash
sudo apt install docker.io
```

### Starting Docker Service

Start and enable the Docker service:

```bash
sudo systemctl start docker
sudo systemctl enable docker
```

### Setting Up Docker User Group

Add your user to the Docker group to run Docker commands without `sudo`:

```bash
sudo groupadd docker
sudo usermod -aG docker $USER
newgrp docker
```

### Cloning the Aztec Packages Repository

Clone the Aztec Protocol packages from GitHub:

```bash
git clone https://github.com/AztecProtocol/aztec-packages
```

### Copying the Deploy Script

Navigate to the directory where you cloned the repository, and copy the deploy script to your home directory:

```bash
cd aztec-packages
cp spartan/oitavos/deploy-oitavos-team.sh ~/deploy.sh
```

**Note**: The script `deploy-oitavos-team.sh` is a temporary name and will be updated in future releases. This script deploys a validator node.

### Exporting Environment Variables

Export the following environment variables that will remain constant for your deployment:

```bash
export AZTEC_IMAGE=your_aztec_image
export ETHEREUM_HOST=your_ethereum_host
export BOOT_NODE_URL=your_boot_node_url
export PUBLIC_IP=your_public_ip
```

- **AZTEC_IMAGE**: The Docker image for the Aztec node.
- **ETHEREUM_HOST**: The Ethereum host node your validator will connect to.
- **BOOT_NODE_URL**: The URL of the boot node for peer discovery.
- **PUBLIC_IP**: The public IP address of your machine.

Replace the placeholders with your actual values.

### Deploying the Validator Node

Whenever you want to launch a validator instance, you need to run a container with unique ports. Since the deploy script reads and writes from the current working directory, create a separate directory for each validator.

For example, to launch the first validator:

```bash
mkdir val1
cd val1
VALIDATOR_PRIVATE_KEY=your_validator_private_key \
VALIDATOR_ADDRESS=your_validator_address \
NODE_PORT=8080 \
P2P_TCP_PORT=40400 \
P2P_UDP_PORT=40500 \
~/deploy.sh
```

- **VALIDATOR_PRIVATE_KEY**: Your validator's private key.
- **VALIDATOR_ADDRESS**: Your validator's Ethereum address.
- **NODE_PORT**: The HTTP port for your node (use a unique port for each validator).
- **P2P_TCP_PORT** and **P2P_UDP_PORT**: Must be port-forward as detailed above! The TCP and UDP ports for peer-to-peer communication (use unique ports).

Replace the placeholders with your actual values.

To deploy additional validators, use different directories and ports:

```bash
# Ensure the same environment variables exported earlier are set
mkdir val2
cd val2
VALIDATOR_PRIVATE_KEY=another_validator_private_key \
VALIDATOR_ADDRESS=another_validator_address \
NODE_PORT=8081 \
P2P_TCP_PORT=40401 \
P2P_UDP_PORT=40501 \
~/deploy.sh
```

Ensure that each validator instance uses unique ports to avoid conflicts.

## Setting Up on Other Operating Systems

### macOS

**Installing Docker Desktop**:

- Download and install [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop).

**Installing Homebrew** (if not already installed):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

** (Optional) Installing Kind and Helm**:

```bash
brew install kind
brew install helm
```

** (Optional) Setting Up Kubernetes**:

- Docker Desktop includes Kubernetes; enable it in the Docker settings.

### Windows

**Installing Docker Desktop**:

- Download and install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop).

**Enabling WSL 2 Backend**:

- Follow the instructions to enable the Windows Subsystem for Linux (WSL 2).

**Installing Chocolatey** (Windows Package Manager):

- Run the following in PowerShell as Administrator:

  ```powershell
  Set-ExecutionPolicy Bypass -Scope Process -Force; `
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; `
  iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
  ```

** (Optional) Installing Kind and Helm**:

```powershell
choco install kind
choco install kubernetes-helm
```

## Configuring Deployment

Before deploying your validator node, ensure you have a funded Ethereum address on the network you are joining. For test networks, you may need to use a faucet or contact network maintainers for test ETH.

### Preparing Your Validator Credentials

- **Validator Private Key**: The private key corresponding to your validator's Ethereum address.
- **Validator Address**: Your validator's Ethereum address.

### Setting Up Environment Variables

Export the necessary environment variables:

```bash
export AZTEC_IMAGE=your_aztec_image
export ETHEREUM_HOST=your_ethereum_host
export BOOT_NODE_URL=your_boot_node_url
export PUBLIC_IP=your_public_ip
```

Ensure these variables are set in your shell session before deploying the validator.

### Deploying the Validator Node

Follow the steps outlined in the [Deploying the Validator Node](#deploying-the-validator-node) section under **Setting Up on Ubuntu 24** to launch your validator instance.

For multiple validators, ensure that each instance uses unique ports and directories.

### Deploying the Cluster (Advanced)

If you are deploying a cluster of validator nodes using Kubernetes, you can use the provided deployment script:

```bash
./deploy-oitavos-spartan.sh aztecprotocol/aztec:your_stable_image
```

This script will add external load balancing services to the `oitavos` namespace.

After running the script:

1. Update the values in `oitavos-spartan.yaml` with the new service addresses.
2. Cancel the deployment and rerun it to apply the updated values.
3. In the `oitavos` namespace, restart the prover node pod to apply the new configuration.

**Note**: In future releases, the pods may be able to dynamically grab the addresses without manual intervention.
**Note**: Name subject to change.

## Troubleshooting

- Check logs for error messages.
- Verify network connectivity, e.g., running isolated commands to ensure that your UDP ports are open.
- Open issues on [GitHub](https://github.com/AztecProtocol/aztec-packages/issues) for suspected bugs or gaps in documentation.

## Background Knowledge

This is a brief summary to understand what the validator is doing at a high level. For the current state of design, please see the [RFC](https://forum.aztec.network/t/request-for-comments-aztecs-block-production-system/6155).

Validators are selected through a committee selection process:

- **Epoch Initialization**:
  - At the start of each epoch, the rollup contract computes a random seed using `block.prevrandao`.
  - The seed is used to select a committee of validators using the Swap-or-Not algorithm.
  - The committee size is fixed for the duration of the epoch.

- **Proposer Selection**:
  - Each validator in the committee is assigned proposer duties for specific slots within the epoch.
  - Proposers know in advance when they will be required to propose a block.

- **Validator Registration**:
  - The rollup contract maintains the active set of validators.
  - Updates to the validator set occur at the beginning of new epochs.
  - Registration includes staking a minimum threshold of collateral (amount to be determined).

- **Interaction with the Contract**:
  - Validators interact with the rollup contract to fulfill their duties.
  - Proposers submit block proposals and proofs to the contract.
