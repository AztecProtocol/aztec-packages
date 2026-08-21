---
id: overview
title: Prover overview
description: What an Aztec prover does, the broker / agent architecture, and minimum hardware requirements.
displayed_sidebar: operatorsSidebar
references: ["yarn-project/prover-node/src/*", "yarn-project/prover-client/src/proving_broker/*"]
---

## Overview

This guide covers the steps required to run a prover on the Aztec network. Operating a prover is a resource-intensive role typically undertaken by experienced engineers due to its technical complexity and hardware requirements.

Aztec provers are critical infrastructure components. They generate cryptographic proofs attesting to transaction correctness, ultimately producing a single rollup proof submitted to Ethereum.

:::tip Prerequisites
Before proceeding, ensure you've reviewed and completed the [prerequisites](../prerequisites.md).
:::

## Prover Architecture

The prover consists of three main components:

1. **Prover node**: Polls L1 for unproven epochs, creates prover jobs, distributes them to the broker, and submits the final rollup proof to the rollup contract.

2. **Prover broker**: Manages the job queue, distributing work to agents and collecting results.

3. **Prover agent(s)**: Executes proof generation jobs in a stateless manner.

## Minimum Requirements

### Prover Node

- 16 core / 32 vCPU (Skylake or newer microarchitecture)
- 16 GB RAM
- 1 TB NVMe SSD
- 25 Mbps network connection

### Prover Broker

- 8 core / 16 vCPU (Skylake or newer microarchitecture)
- 16 GB RAM
- 10 GB SSD

### Prover Agents

**For each agent:**
- 32 core / 64 vCPU (Skylake or newer microarchitecture)
- 128 GB RAM
- 10 GB SSD

These requirements are subject to change as the network throughput increases. Prover agents require high-performance hardware, typically data center-grade infrastructure.

:::tip Running Multiple Agents
You can run multiple prover agents on a single machine by adjusting `PROVER_AGENT_COUNT`. Hardware requirements scale approximately linearly:
- **2 agents**: 64 cores, 256 GB RAM
- **3 agents**: 96 cores, 384 GB RAM
- **4 agents**: 128 cores, 512 GB RAM
:::
