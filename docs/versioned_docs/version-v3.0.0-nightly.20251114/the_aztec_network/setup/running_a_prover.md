---
id: running_a_prover
sidebar_position: 4
title: Running a Prover
description: A comprehensive guide on how to run an Aztec prover on the network using Docker Compose in single-machine or distributed configurations.
---

## Overview

This guide covers the steps required to run a prover on the Aztec network. Operating a prover is a resource-intensive role typically undertaken by experienced engineers due to its technical complexity and hardware requirements.

Aztec provers are critical infrastructure components. They generate cryptographic proofs attesting to transaction correctness, ultimately producing a single rollup proof submitted to Ethereum.

:::tip Prerequisites
Before proceeding, ensure you've reviewed and completed the [prerequisites](../prerequisites.md) for the Docker Compose method.
:::

:::info Deployment Method
This guide uses the **Docker Compose method**. This is the recommended approach for prover nodes due to the complexity of managing distributed components.
:::

## Prover Architecture

The prover consists of three main components:

1. **Prover node**: Polls L1 for unproven epochs, creates prover jobs, distributes them to the broker, and submits the final rollup proof to the rollup contract.

2. **Prover broker**: Manages the job queue, distributing work to agents and collecting results.

3. **Prover agent(s)**: Executes proof generation jobs in a stateless manner.

## Minimum Requirements

### Prover Node

- 2 core / 4 vCPU (released in 2015 or later)
- 16 GB RAM
- 1 TB NVMe SSD
- 25 Mbps network connection

### Prover Broker

- 2 core / 4 vCPU (released in 2015 or later)
- 16 GB RAM
- 10 GB SSD

### Prover Agents

**For each agent:**
- 32 core / 64 vCPU (released in 2015 or later)
- 128 GB RAM
- 10 GB SSD

These requirements are subject to change as the network throughput increases. Prover agents require high-performance hardware, typically data center-grade infrastructure.

:::tip Running Multiple Agents
You can run multiple prover agents on a single machine by adjusting `PROVER_AGENT_COUNT`. Hardware requirements scale approximately linearly:
- **2 agents**: 64 cores, 256 GB RAM
- **3 agents**: 96 cores, 384 GB RAM
- **4 agents**: 128 cores, 512 GB RAM

This scaling applies to both single-machine and distributed setups.
:::

**Before proceeding:** Ensure you've reviewed and completed the [prerequisites](../prerequisites.md) for the Docker Compose method. This guide uses Docker Compose, which is the recommended approach for prover nodes.

## Generating Keys

Before setting up your prover, you need to generate the required Ethereum private key for the prover publisher.

### Prover Publisher Private Key

The prover publisher key is used to submit proofs to L1. This account needs ETH funding to pay for L1 gas.

Generate an Ethereum private key using Foundry's `cast` tool:

```bash
# Generate a new wallet with a 24-word mnemonic
cast wallet new-mnemonic --words 24

# This outputs a mnemonic phrase, a derived address, and private key
# Save these securely - you'll need the private key for PROVER_PUBLISHER_PRIVATE_KEY
# and the address for PROVER_ID
```

**Important notes:**
- Save both the private key and the derived address securely
- The private key will be used for `PROVER_PUBLISHER_PRIVATE_KEY`
- The derived Ethereum address will be used for `PROVER_ID`

:::warning Account Funding Required
The publisher account needs to be funded with ETH to post proofs to L1. Ensure the account holds sufficient ETH for gas costs during operation.
:::

:::tip
If you don't have Foundry installed, follow the installation guide at [getfoundry.sh](https://getfoundry.sh/).
:::

## Setup Options

Choose the setup method that best fits your infrastructure:

- **[Single Machine Setup](./prover_single_machine.md)**: Run all prover components on a single high-performance machine. Ideal for testing or smaller-scale operations.
- **[Distributed Setup](./prover_distributed.md)**: Distribute prover components across multiple machines for production deployments with better resource utilization and scalability.

After completing your setup, proceed to [Prover Verification and Troubleshooting](./prover_verification_troubleshooting.md) to verify your prover is working correctly and for help with common issues.
