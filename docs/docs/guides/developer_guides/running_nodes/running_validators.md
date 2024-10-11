# Aztec Validator Node Guide

## Introduction

This guide provides step-by-step instructions on how to set up an Aztec Layer 2 validator node. Running a node allows you to participate in the Aztec network as a validator (also known as a sequencer or proposer), contributing to the network's security and decentralization.

The use of kubernetes means that these steps apply smoothly to a local KIND instance or a cloud deployment.
The benefit of using kubernetes is that load balancing is handled for you, meaning that having validator redundancy is easy and critical slots are not missed.
Note that if only intending to deploy to the cloud, the KIND tool setup can be skipped.

For the current state of design please see the RFC at https://forum.aztec.network/t/request-for-comments-aztecs-block-production-system/6155.

## Background Knowledge

This is a brief summary to know what the validator is doing at a high-level, for a detailed explanation see https://forum.aztec.network/t/request-for-comments-aztecs-block-production-system/6155.
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
  - Registration includes staking a minimum threshold of a to-be-determined collateral.

- **Interaction with the Contract**:
  - Validators interact with the rollup contract to fulfill their duties.
  - Proposers submit block proposals and proofs to the contract.

## Table of Contents

1. [Prerequisites](#prerequisites)
1. [Port Forwarding](#port-forwarding)
2. [Setting Up on Ubuntu 24](#setting-up-on-ubuntu-24)
3. [Setting Up on Other Operating Systems](#setting-up-on-other-operating-systems)
4. [Configuring Deployment](#configuring-deployment)
6. [Troubleshooting](#troubleshooting)
7. [References](#references)

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

#### Workarounds:
For example, a restrictive setup like hotel wifi would require use of a VPN, using `socat` into a port-forwarded computer, or just using a cloud instance directly with instructions above. Note: It may be possible to use a p2p relay service that works with the DiscV5 protocol, but it is currently untested.

## Setting Up on Ubuntu 24

TODO(https://github.com/AztecProtocol/aztec-packages/issues/9191)
NOTE: The scripts mentioned here do not currently work on ARM. This will be supported in the future with the same instructions.

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

### Cloning the Aztec Packages Repository

Clone the Aztec Protocol packages from GitHub:

```bash
git clone https://github.com/AztecProtocol/aztec-packages
```

### Running the Setup Script

TODO

TODO(https://github.com/AztecProtocol/aztec-packages/issues/9210): To be added - Steps for how to use the k8s setup to deploy to cloud.

## Setting Up on Other Operating Systems

### macOS

**Installing Docker Desktop**:

- Download and install [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop).

**Installing Homebrew** (if not already installed):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Installing Kind and Helm**:

```bash
brew install kind
brew install helm
```

**Setting Up Kubernetes**:

- Docker Desktop includes Kubernetes; enable it in the Docker settings.

**Fill in Missing Details**:

- Verify that Docker Engine is running.
- Configure your Kubernetes context if necessary.

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

**Installing Kind and Helm**:

```powershell
choco install kind
choco install kubernetes-helm
```

## Configuring Deployment

Ensure you have a funded ethereum address on the network used by the validator set you are trying to join.
If you are trying to join a test network, this would be a testnet, and you may need to use a faucet to get ETH or ask the network maintainers.

**Steps**:

TODO.

## Troubleshooting
- Check logs for error messages.
- Verify network connectivity, e.g. running isolated commands to ensure that your UDP ports are open.
- Open issues in https://github.com/AztecProtocol/aztec-packages/issues for suspected bugs or gaps in documentation.

## References

- **Aztec Protocol Documentation**: [docs.aztec.network](https://docs.aztec.network/)
- **Aztec GitHub Repository**: [Aztec Protocol on GitHub](https://github.com/AztecProtocol)
- **Swap-or-Not Algorithm**: [Ethereum's RANDAO Implementation](https://github.com/ethereum/annotated-spec/blob/master/phase0/beacon-chain.md#randao)
- **Kubernetes Documentation**: [kubernetes.io/docs](https://kubernetes.io/docs/)
- **Helm Documentation**: [helm.sh/docs](https://helm.sh/docs/)
