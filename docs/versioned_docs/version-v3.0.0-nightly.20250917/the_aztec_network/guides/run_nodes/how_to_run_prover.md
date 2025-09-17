---
sidebar_position: 3
title: How to Run an Aztec Prover
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

This guide will go over the steps required to run a prover on Aztec. It will also provide context to ensure users are comfortable with the steps they are taking.

Aztec provers are a critical part of the Aztec network's infrastructure. They generate cryptographic proofs that attest to the correctness of transactions, ultimately producing a single rollup proof that is submitted to Ethereum.

The prover is a complex stack of processes that consists of:

1. The prover node: responsible for polling the L1 for unproven epochs and initiating the proof process. When an epoch is ready to be proven, the prover node creates proving jobs and distributes them to the broker. It is also responsible for submitting the final rollup proof to the rollup contract.

2. The prover broker: Manages a queue of proving jobs, distributing them to available agents and forwarding results back to the node.

3. The prover agent(s): Executes the actual proof jobs. Agents are stateless, fetch work from the broker, and return the results.

Operating a prover requires a solid grasp of blockchain protocols, cryptographic systems, DevOps best practices, and high-performance hardware. It’s a resource-intensive role typically undertaken by experienced engineers or specialized teams due to its cost and technical / operational complexity.

## Prerequisites

The minimum hardware specifications for each of the components is listed below.

#### Prover Node

Minimum specifications:

- 2 core / 4 vCPU
- 16 GB RAM
- 1 TB NVMe SDD
- 25 Mbps network connection

#### Proving Broker

Minimum specifications:

- 2 core / 4 vCPU
- 16 GB RAM
- 10 GB SDD

#### Proving Agents

Minimum specifications:

- 32 core / 64 vCPU
- 128 GB RAM
- 10 GB SDD

This guide will outline a basic, non-distributed setup placing all of the components on one machine that is powerful enough to handle the combined load.

This guide expects you to be using a "standard" Linux distribution like Debian / Ubuntu when following along with the steps.

It also is assumed that you have installed Docker and the aztec toolchain via aztec-up as described in the [getting started section](../../index.md).

Furthermore, as this guide uses Docker compose, you will need to install it. Please follow [this](https://docs.docker.com/compose/install/) guide to do so.

Finally, this guide requires you to have endpoints of an L1 node stack of an execution and consensus client. If you do not have one set up, you can see a good guide on how to do that [here at Eth Docker](https://ethdocker.com/Usage/QuickStart).

Your confidence level is expected to be around "I'd be able to run a Prover _without_ this guide".

## Configure the prover

There are a few important things to note when setting up a prover. This guide will guide you in setting up and running a prover with a standard setup using Docker compose with a .env file.

The setup of the prover has four important steps.

1. Set required component configuration
2. Ensure auto-update / auto-restart is enabled
3. Apply your Docker compose file

Let's start by creating a new directory called `aztec-prover`, with two subdirectories, `prover-node-data`, and `prover-broker-data`. This is where all the information used by the prover will be stored. Please also create an empty `.env` file in `aztec-prover` to define your settings before moving on to the next step.

### Prover configuration

You will need to define some environment variables that set important configuration for your prover.

As we have three components, we will split our config respectively.

#### Prover node configuration

Let's start by defining configuration for the prover node

These include:

- `DATA_DIRECTORY`: the folder where the data of the prover node is stored
- `P2P_IP`: The IP address of this prover node
- `P2P_PORT`: The port that P2P communication happens on
- `ETHEREUM_HOSTS`: The execution RPC endpoints
- `L1_CONSENSUS_HOST_URLS`: The consensus RPC endpoints
- `LOG_LEVEL`: the desired level of logging for the prover node. It defaults to `INFO`
- `PROVER_BROKER_HOST`: The endpoint of the prover broker that this node sends prover jobs to
- `PROVER_PUBLISHER_PRIVATE_KEY`: the private key of the Ethereum EOA used for publishing the proofs to L1
- `AZTEC_PORT`: The port that the prover node API is exposed on

Please paste this sample `.env` file into the empty one currently residing in your `aztec-prover` folder. Please note that we are assuming you are using the default ports of 8080 for the prover node itself, and 40400 for p2p connectivity. If this is not the case, please overwrite the defaults below.

```sh
DATA_DIRECTORY=./prover-node-data
P2P_IP=<your external IP address>
P2P_PORT=40400
ETHEREUM_HOSTS=<your L1 execution endpoint, or a comma separated list if you have multiple>
L1_CONSENSUS_HOST_URLS=<your L1 consensus endpoint, or a comma separated list if you have multiple>
LOG_LEVEL=info
PROVER_BROKER_HOST=http://prover-broker:8080
PROVER_PUBLISHER_PRIVATE_KEY=<the private key of the L1 EOA your prover will publish proofs from>
AZTEC_PORT=8080
```

Note this setup assumes that the prover broker will be run on `http://prover-broker:8080` as it will be defined later in the docker compose.

:::tip
You MUST forward your ports. Your router must send UDP and TCP traffic on the port specified by `P2P_PORT` to your IP address on your local network.

Running the command `curl ipv4.icanhazip.com` can retrieve your public IP address for you.
:::

#### Prover broker configuration

Let's continue by outlining configuration for the prover broker.

These include:

- `DATA_DIRECTORY`: the folder where the data of the prover broker is stored
- `LOG_LEVEL`: the desired level of logging for the prover broker. It defaults to `INFO`
- `ETHEREUM_HOSTS`: The execution RPC endpoints
- `P2P_IP`: The IP address of this prover broker
- `P2P_PORT`: The port that P2P communication happens on

Note that this configuration is reused in our example as there exists overlap between this and the prover node above, but we are showing this for illustration purposes in the case that you want to a different machine for the prover broker and the prover node. Due to the reuse in `DATA_DIRECTORY` between the prover node and the prover broker to define where their data stores are located, we will define a different environment variable to be used by the prover broker.

Please add this line to your `.env` file.
```sh
PROVER_BROKER_DATA_DIRECTORY=./prover-broker-data
```

#### Prover agent configuration

Finally, let's finish by defining configuration for the prover agent

These include:

- `PROVER_AGENT_COUNT`: how many prover agents are run in the process. each agent takes approximately 10GB of ram to run without creating bottlenecks
- `PROVER_AGENT_POLL_INTERVAL_MS`: how long that the prover agent should wait between each request to the proving broker
- `PROVER_BROKER_HOST`: the location for the proving agent to look and to submit its jobs to
- `PROVER_ID`: the address of the Ethereum EOA used for publishing the proofs to L1 (this should correspond to `PROVER_PUBLISHER_PRIVATE_KEY` set as config in the prover node)

Please add these lines into the `.env` file currently residing in your `aztec-prover` folder.

```sh
PROVER_AGENT_COUNT=10
PROVER_AGENT_POLL_INTERVAL_MS=10000
PROVER_BROKER_HOST=http://prover-broker:8080
PROVER_ID=<the address corresponding to the PROVER_PUBLISHER_PRIVATE_KEY you set on the node>
```

### Enable auto-update / auto-restart

It is imperative that the built in auto-updating functionality of the prover node is not disabled. The update-checker is a background module in the prover node that enables global coordination of updates. It allows the protocol team to:

- Push configuration changes to all nodes
- Trigger shutdowns so that nodes can pull the latest image version
- Apply hot-fixes quickly
- Coordinate node resets after a governance upgrade, especially when a new canonical rollup is published to the Registry

This module ensures that upgrades and fixes propagate smoothly without requiring manual intervention from every node operator.

Please ensure environment variables:

`AUTO_UPDATE_URL` and `AUTO_UPDATE` remain unset, as to take their default values (which are the s3 bucket being used to host the update information, and `config-and-version` respectively).

Because docker-compose does not respect pull policies on container restarts, to handle updates properly, add Watchtower to your stack by running:

```sh
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower
```

### Applying your Docker compose file

```yml
name: aztec-prover
services:
  prover-node:
    image: aztecprotocol/aztec:latest
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
      DATA_DIRECTORY: /var/lib/data
      ETHEREUM_HOSTS: ${ETHEREUM_HOSTS}
      L1_CONSENSUS_HOST_URLS: ${L1_CONSENSUS_HOST_URLS}
      LOG_LEVEL: ${LOG_LEVEL}
      PROVER_BROKER_HOST: ${PROVER_BROKER_HOST}
      PROVER_PUBLISHER_PRIVATE_KEY: ${PROVER_PUBLISHER_PRIVATE_KEY}
      P2P_PORT: ${P2P_PORT}
      AZTEC_PORT: ${AZTEC_PORT}
    ports:
      - ${AZTEC_PORT}:${AZTEC_PORT}
      - ${P2P_PORT}:${P2P_PORT}
      - ${P2P_PORT}:${P2P_PORT}/udp
    volumes:
      - ${DATA_DIRECTORY}:/var/lib/data

  prover-broker:
    image: aztecprotocol/aztec:latest
    command:
      - node
      - --no-warnings
      - /usr/src/yarn-project/aztec/dest/bin/index.js
      - start
      - --prover-broker
      - --network
      - alpha-testnet
    environment:
      DATA_DIRECTORY: /var/lib/data
      ETHEREUM_HOSTS: ${ETHEREUM_HOSTS}
      P2P_IP: ${P2P_IP}
      LOG_LEVEL: ${LOG_LEVEL}
    volumes:
      - ${PROVER_BROKER_DATA_DIRECTORY}:/var/lib/data

  prover-agent:
    image: aztecprotocol/aztec:latest
    command:
      - node
      - --no-warnings
      - /usr/src/yarn-project/aztec/dest/bin/index.js
      - start
      - --prover-agent
      - --network
      - alpha-testnet
    environment:
      PROVER_AGENT_COUNT: ${PROVER_AGENT_COUNT}
      PROVER_AGENT_POLL_INTERVAL_MS: ${PROVER_AGENT_POLL_INTERVAL_MS}
      PROVER_BROKER_HOST: ${PROVER_BROKER_HOST}
      PROVER_ID: ${PROVER_ID}
    pull_policy: always
    restart: unless-stopped
```

Please note that we are setting only the necessary configuration for running this prover. The full list of settings and flags can be explored here at the [cli reference](../../reference/cli_reference.md). A lot of these options are preset to defaults by the `--network` flag above. This downloads defaults for the specified network and applies them to the node.

Now, you can run `docker compose up` inside your `aztec-prover` folder to start the prover!
