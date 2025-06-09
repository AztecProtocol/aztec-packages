---
sidebar_position: 3
title: How to Run a Prover Node
description: A comprehensive guide to setting up and running an Aztec Prover node on testnet or mainnet, including hardware requirements, configuration options, and performance optimization tips.
keywords:
  [
    aztec,
    prover,
    node,
    blockchain,
    L2,
    scaling,
    ethereum,
    zero-knowledge,
    ZK,
    setup,
    tutorial,
  ]
tags:
  - prover
  - node
  - tutorial
  - infrastructure
---

import { AztecTestnetVersion } from '@site/src/components/Snippets/general_snippets';

## Background

Prover nodes are a critical part of the Aztec network's infrastructure. They generate cryptographic proofs that attest to the correctness of public transactions, ultimately producing a single rollup proof that is submitted to Ethereum.

Operating a prover node requires a solid grasp of blockchain protocols, cryptographic systems, DevOps best practices, and high-performance hardware. It’s a resource-intensive role typically undertaken by experienced engineers or specialized teams due to its technical and operational complexity.

## Prerequisites

Before following this guide, make sure you:

- Have the `aztec` tool [installed](../../../developers/getting_started.md#install-the-sandbox)
- Have sufficient hardware resources for proving operations
- Your confidence level is expected to be around "I'd be able to run a Prover _without_ this guide"

## Understanding Prover Architecture

The Aztec prover involves three key components: the Prover Node, the Proving Broker, and the Proving Agent.

#### Prover Node

The Prover Node is responsible for polling the L1 for unproven epochs and initiating the proof process. When an epoch is ready to be proven, the prover node creates proving jobs and distributes them to the broker. The Prover Node is also responsible for submitting the final rollup proof to the rollup contract.

- **Resources**: Up to 8 cores, 16GB RAM, ~1TB disk for storing state.

#### Proving Broker

Manages a queue of proving jobs, distributing them to available agents and forwarding results back to the node.

- **Resources**: Up to 4 cores, 16GB RAM, ~1GB disk.

#### Proving Agents

Executes the actual proof jobs. Agents are stateless, fetch work from the broker, and return the results.

- **Resources**: Each agent may use up to 16 cores and 128GB RAM.

## Setting Up Your Prover

### Using Docker Compose

```yml
name: aztec-prover
services:
  prover-node:
    image: aztecprotocol/aztec:0.87.8 # Always refer to the docs to check that you're using the correct image.
    command:
      - node
      - --no-warnings
      - /usr/src/yarn-project/aztec/dest/bin/index.js
      - start
      - --prover-node
      - --archiver
      - --network
      - alpha-testnet
    depends_on:
      broker:
        condition: service_started
        required: true
    environment:
      # PROVER_COORDINATION_NODE_URL: "http://:8080" # this can point to your own validator - using this replaces the need for the prover node to be on the P2P network and uses your validator as a sentry node of some sort.
      # P2P_ENABLED: "false" # Switch to false if you provide a PROVER_COORDINATION_NODE_URL
      DATA_DIRECTORY: /data
      DATA_STORE_MAP_SIZE_KB: "134217728"
      ETHEREUM_HOSTS: # EL RPC endpoint
      L1_CONSENSUS_HOST_URLS: # CL RPC endpoint
      LOG_LEVEL: info
      PROVER_BROKER_HOST: http://broker:8080
      PROVER_PUBLISHER_PRIVATE_KEY: # The node needs to publish proofs to L1. Replace with your private key
    ports:
      - "8080:8080"
      - "40400:40400"
      - "40400:40400/udp"
    volumes:
      - /home/my-node/node:/data # Local directory

  agent:
    image: aztecprotocol/aztec:0.87.8 # Always refer to the docs to check that you're using the correct image.
    command:
      - node
      - --no-warnings
      - /usr/src/yarn-project/aztec/dest/bin/index.js
      - start
      - --prover-agent
      - --network
      - alpha-testnet
    environment:
      PROVER_AGENT_COUNT: "1"
      PROVER_AGENT_POLL_INTERVAL_MS: "10000" # Just to reduce the log spamming if you're using debug logging.
      PROVER_BROKER_HOST: http://broker:8080
      PROVER_ID: # this should be the address corresponding to the PROVER_PUBLISHER_PRIVATE_KEY you set on the node.
    pull_policy: always
    restart: unless-stopped

  broker:
    image: aztecprotocol/aztec:0.87.8 # Always refer to the docs to check that you're using the correct image.
    command:
      - node
      - --no-warnings
      - /usr/src/yarn-project/aztec/dest/bin/index.js
      - start
      - --prover-broker
      - --network
      - alpha-testnet
    environment:
      DATA_DIRECTORY: /data
      ETHEREUM_HOSTS: # Your EL RPC endpoint
      LOG_LEVEL: info
    volumes:
      - /home/my-node/node:/data # Local directory
```
