# Aztec Validator Node Guide

## Introduction

This guide provides step-by-step instructions on how to set up an Aztec Layer 2 validator node (also called a sequencer). Running a node allows you to participate in the Aztec network as a validator (also known as a sequencer or proposer), contributing to the network's security and decentralization.

For the current state of design please see the RFC at https://forum.aztec.network/t/request-for-comments-aztecs-block-production-system/6155.

## Prerequisites

- **Operating System**: One of the following
  - Ubuntu 24.04 LTS
  - macOS
  - Windows
- **Basic Knowledge**: Familiarity with your operating system's command-line interface.
- **Hardware Requirements**:
| 🖥️          | Minimum       | Recommended    |
|-------------|---------------|----------------|
| **CPU**     | 16 cores      | 32 cores       |
| **Network** | 32 mb/s       | 128 mb/s       |
| **Storage** | 3 TB          | 5 TB           |
| **RAM**     | 32 GB         | 64 GB          |


## Table of Contents

1. [Port Forwarding](#port-forwarding)
   - Understanding Port Forwarding
   - When Port Forwarding Is Not Possible
2. [Setting Up on Ubuntu 24 (x64)](#setting-up-on-ubuntu-24-x64)
   - Updating the System
   - Installing Docker
   - Starting Docker Service
   - Cloning the Aztec Packages Repository
   - Running the Setup Script
3. [Setting Up on Other Operating Systems](#setting-up-on-other-operating-systems)
   - macOS
   - Windows
4. [Configuring Helm Install](#configuring-helm-install)
   - Setting Ports
   - Adding Ethereum Validator Private Keys
   - How Validators Are Chosen
   - Recording Validators into the Rollup Contract
5. [Overview of Prover Nodes](#overview-of-prover-nodes)
   - Role of Prover Nodes
   - Prover Bond
   - Consensus Participation
6. [Additional Background](#additional-background)
7. [Conclusion](#conclusion)
8. [References](#references)

---
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

## Configuring Helm Install

### Setting Ports

Configure the ports in the Helm chart values file:

### Adding Ethereum Validator Private Keys

Your node requires an Ethereum private key to participate as a validator.

**Steps**:

1. **Generate or Obtain a Private Key**:
   - Use a secure method to generate an Ethereum private key.
   - **Warning**: Never share your private key publicly.

2. **Fund the Private Key**:
   - Ensure the address associated with your private key has enough ETH to cover gas fees.

3. **Securely Store the Private Key**:
   - Use a key management system or environment variables.

4. **Provide the Private Key to Helm**:
   - Create a Kubernetes secret:
     ```bash
     kubectl create secret generic eth-private-key --from-literal=key=<YOUR_PRIVATE_KEY>
     ```
   - Reference the secret in your `values.yaml`:
     ```yaml
     ethPrivateKeySecretName: eth-private-key
     ```

**Fill in Missing Details**:

- Replace `<YOUR_PRIVATE_KEY>` with your actual private key.
- Ensure that the Kubernetes cluster has access to the secret.

### How Validators Are Chosen

Validators are selected through a committee selection process:

- **Epoch Initialization**:
  - At the start of each epoch, the rollup contract computes a random seed using `block.prevrandao`.
  - The seed is used to select a committee of validators using the Swap-or-Not algorithm.
  - The committee size is fixed for the duration of the epoch.

- **Proposer Selection**:
  - Each validator in the committee is assigned proposer duties for specific slots within the epoch.
  - Proposers know in advance when they will be required to propose a block.

**Key Points**:

- **Swap-or-Not Algorithm**: Ensures fair and unbiased selection.
- **Fixed Committee**: Provides stability and predictability for the epoch.

### Recording Validators into the Rollup Contract

Validators are recorded in the Layer 1 rollup contract upon joining the network successfully:

- **Validator Registration**:
  - The rollup contract maintains the active set of validators.
  - Updates to the validator set occur at the beginning of new epochs.
  - Registration includes staking a minimum threshold of a to-be-determined collateral.

- **Interaction with the Contract**:
  - Validators interact with the rollup contract to fulfill their duties.
  - Proposers submit block proposals and proofs to the contract.

## Additional Background

- **Epochs and Slots**:
  - An epoch consists of 32 slots.
  - Each slot represents a fixed time interval.

- **Pending Chain vs. Proven Chain**:
  - **Pending Chain**: Contains proposed blocks awaiting finalization.
  - **Proven Chain**: Contains finalized blocks after proofs are verified on L1.

- **Fallback Mechanisms**:
  - **Based Fallback Mode**: Activated if the chain does not progress, allowing for ledger growth without the committee.
  - **Forced Inclusion Queue**: Ensures censorship resistance by mandating the inclusion of certain transactions.

- **Security Considerations**:
  - Keep your private keys secure.
  - Regularly update your software to the latest versions.

- **Troubleshooting**:
  - Check logs for error messages.
  - Verify network connectivity, e.g. running isolated commands to ensure that your UDP ports are open.
  - Open issues in https://github.com/AztecProtocol/aztec-packages/issues for suspected bugs or gaps in documentation.

## Conclusion

By setting up an Aztec Layer 2 node, you contribute to the network's security, decentralization, and efficiency. Validators play a crucial role in proposing blocks and maintaining the integrity of the blockchain. We encourage you to participate actively and stay informed about protocol updates.

## References

- **Aztec Protocol Documentation**: [docs.aztec.network](https://docs.aztec.network/)
- **Aztec GitHub Repository**: [Aztec Protocol on GitHub](https://github.com/AztecProtocol)
- **Swap-or-Not Algorithm**: [Ethereum's RANDAO Implementation](https://github.com/ethereum/annotated-spec/blob/master/phase0/beacon-chain.md#randao)
- **Kubernetes Documentation**: [kubernetes.io/docs](https://kubernetes.io/docs/)
- **Helm Documentation**: [helm.sh/docs](https://helm.sh/docs/)
