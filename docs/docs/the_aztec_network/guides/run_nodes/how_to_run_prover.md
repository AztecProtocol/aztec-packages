---
sidebar_position: 2
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

## Background

Prover nodes are a critical part of the Aztec network's infrastructure. They generate cryptographic proofs that attest to the correctness of public transactions, ultimately producing a single rollup proof that is submitted to Ethereum.

Operating a prover node requires a solid grasp of blockchain protocols, cryptographic systems, DevOps best practices, and high-performance hardware. It’s a resource-intensive role typically undertaken by experienced engineers or specialized teams due to its technical and operational complexity.

## Prerequisites

Before following this guide, make sure you:

- Have the `aztec` tool [installed](../../../developers/getting_started.md#install-the-sandbox)
- Fully understand the [concepts](../../concepts/provers-and-sequencers/) on proving and sequencing
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
  agent:
    command:
      - node
      - --no-warnings
      - /usr/src/yarn-project/aztec/dest/bin/index.js
      - start
      - --prover-agent
    environment:
      LOG_LEVEL: debug
      PROVER_AGENT_COUNT: "1"
      # PROVER_AGENT_POLL_INTERVAL_MS: "1000"
      PROVER_AGENT_POLL_INTERVAL_MS: "10000" # Just to reduce the log spamming if you're using debug logging.
      PROVER_BROKER_HOST: http://broker:8080
      PROVER_ID: 0x4a3d0D04770A89D41EE3167C13E3D67E9b33358E # this should be the address corresponding to the PROVER_PUBLISHER_PRIVATE_KEY you set on the node.
      PROVER_REAL_PROOFS: "true"
    image: aztecprotocol/aztec:0.85.0-alpha-testnet.2 # Always refer to the docs to check that you're using the correct image.
    logging:
      driver: json-file
      options:
        max-file: "3"
        max-size: 100m
        tag: '{{.ImageName}}|{{.Name}}|{{.ImageFullID}}|{{.FullID}}'
    networks:
      default: null
    pull_policy: always
    restart: unless-stopped
    stop_grace_period: 1m0s

  broker:
    command:
      - node
      - --no-warnings
      - /usr/src/yarn-project/aztec/dest/bin/index.js
      - start
      - --prover-broker
    environment:
      AZTEC_PORT: "8080"
      DATA_DIRECTORY: /data
      DATA_STORE_MAP_SIZE_KB: "134217728"
      ETHEREUM_HOSTS: # Your EL RPC endpoint
      L1_CHAIN_ID: "11155111"
      LOG_LEVEL: info
      PROVER_BROKER_JOB_MAX_RETRIES: "3"
      PROVER_BROKER_JOB_TIMEOUT_MS: "30000"
      PROVER_BROKER_POLL_INTERVAL_MS: "1000"
      REGISTRY_CONTRACT_ADDRESS: 0x12b3ebc176a1646b911391eab3760764f2e05fe3
    image: aztecprotocol/aztec:0.85.0-alpha-testnet.2 # Always refer to the docs to check that you're using the correct image.
    logging:
      driver: json-file
      options:
        max-file: "3"
        max-size: 100m
        tag: '{{.ImageName}}|{{.Name}}|{{.ImageFullID}}|{{.FullID}}'
    networks:
      default: null
    # ports:
    #   - mode: ingress
    #     host_ip: 192.168.0.1
    #     target: 8080
    #     published: "8080"
    #     protocol: tcp
    ports:
      - "8084:80"
    pull_policy: always
    restart: unless-stopped
    stop_grace_period: 1m0s
    volumes:
      - /home/phil/prover-node/broker:/data # Local directory
      # - type: volume
      #   source: aztec-broker-data
      #   target: /data
      #   volume: {}

  node:
    command:
      - node
      - --no-warnings
      - /usr/src/yarn-project/aztec/dest/bin/index.js
      - start
      - --prover-node
      - --archiver
    depends_on:
      broker:
        condition: service_started
        required: true
    environment:
      # PROVER_COORDINATION_NODE_URL: "http://192.168.0.80:8080" # this can point to your own validator - using this replaces the need for the prover node to be on the P2P network and uses your validator as a sentry node of some sort.
      AZTEC_EPOCH_DURATION: "32"
      AZTEC_PROOF_SUBMISSION_WINDOW: "64"
      AZTEC_SLOT_DURATION: "36"
      BOOTSTRAP_NODES: ## Refer to http://static.aztec.network/{networkName}/bootnodes.json for the latest bootnodes. networkName=alpha-testnet for example
      enr:-LO4QLbJddVpePYjaiCftOBY-L7O6Mfj_43TAn5Q1Y-5qQ_OWmSFc7bTKWHzw5xmdVIqXUiizum_kIRniXdPnWHHcwEEhWF6dGVjqDAwLTExMTU1MTExLTAwMDAwMDAwLTAtMTgwNmEwMjgtMWE1MzBmM2KCaWSCdjSCaXCEI8nh9YlzZWNwMjU2azGhA-_dX6aFcXP1DLk91negbXL2a0mNYGXH4hrMvb2i92I0g3VkcIKd0A, enr:-LO4QN4WF8kFyV3sQVX0C_y_03Eepxk5Wac70l9QJcIDRYwKS6aRst1YcfbTDdvovXdRfKf-WSXNVWViGLhDA-dUz2MEhWF6dGVjqDAwLTExMTU1MTExLTAwMDAwMDAwLTAtMTgwNmEwMjgtMWE1MzBmM2KCaWSCdjSCaXCEIicTHolzZWNwMjU2azGhAsz7aFFYRnP5xjTux5UW-HyEQcW_EJrZMT1CNm79N4g-g3VkcIKd0A, enr:-LO4QFrGfkRaCk_iFTeUjR5ESwo45Eov9hx_T1-BLdoT-iHzFgCiHMT4V1KBtdFp8D0ajLSe5HcNYrhalmdJXgv6NTUEhWF6dGVjqDAwLTExMTU1MTExLTAwMDAwMDAwLTAtMTgwNmEwMjgtMWE1MzBmM2KCaWSCdjSCaXCEIlICt4lzZWNwMjU2azGhAlC6nKB3iDtRFqWKWqxf_t-P9hc-SZ6VFBJV4y3bTZBQg3VkcIKd0A
      DATA_DIRECTORY: /data
      DATA_STORE_MAP_SIZE_KB: "134217728"
      #ETHEREUM_HOSTS: https://sepolia-a.cryptomanufaktur.net,https://sepolia-c.cryptomanufaktur.net
      L1_CHAIN_ID: "11155111"
      L1_CONSENSUS_HOST_URL: # CL RPC endpoint
      L1_FIXED_PRIORITY_FEE_PER_GAS: "3"
      L1_GAS_LIMIT_BUFFER_PERCENTAGE: "15"
      L1_GAS_PRICE_MAX: "500"
      LOG_LEVEL: info
      P2P_ENABLED: "true"
      # P2P_ENABLED: "false" # Switch to false if you provide a PROVER_COORDINATION_NODE_URL
      P2P_PORT: 40400 # the port you use to announce your node on the p2p network.
      PROVER_BROKER_HOST: http://broker:8080
      PROVER_PUBLISHER_PRIVATE_KEY:  # The node needs to publish proofs to L1. Replace with your private key
      REGISTRY_CONTRACT_ADDRESS: 0x4d2cc1d5fb6be65240e0bfc8154243e69c0fb19e # The address of the Registry contract. Refer to the docs website to make sure you're using the right address
      TEST_ACCOUNTS: "false"
      SPONSORED_FPC: "true"
      PROVER_REAL_PROOFS: "true"
    image: aztecprotocol/aztec:0.85.0-alpha-testnet.2 # Always refer to the docs to check that you're using the correct image.
    logging:
      driver: json-file
      options:
        max-file: "3"
        max-size: 100m
        tag: '{{.ImageName}}|{{.Name}}|{{.ImageFullID}}|{{.FullID}}'
    networks:
      default: null
    ports:
      - "8083:80"
      - "40400:40400"
      - "40400:40400/udp"
    # ports:
    #   - mode: ingress
    #     target: 40400
    #     published: "40400"
    #     protocol: udp
    #   - mode: ingress
    #     target: 40400
    #     published: "40400"
    #     protocol: tcp
    pull_policy: always
    restart: unless-stopped
    stop_grace_period: 1m0s
    volumes:
      - /home/my-node/node:/data # Local directory
      # - type: volume
      #   source: aztec-node-data
      #   target: /data
      #   volume: {}
# networks:
#   default:
#     name: aztec-prover_default
# volumes:
#   aztec-broker-data:
#     name: aztec-prover_aztec-broker-data
#   aztec-node-data:
#     name: aztec-prover_aztec-node-data
# x-logging:
#   logging:
#     driver: json-file
#     options:
#       max-file: "3"
#       max-size: 100m
#       tag: '{{.ImageName}}|{{.Name}}|{{.ImageFullID}}|{{.FullID}}'
```
