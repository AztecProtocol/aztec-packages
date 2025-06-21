---
sidebar_position: 1
title: How to Run a Full Node
description: A comprehensive guide to setting up and running an Aztec full node on testnet, including infrastructure requirements, configuration options, and troubleshooting tips.
keywords: [aztec, node, blockchain, L2, scaling, ethereum, setup, tutorial]
tags:
  - node
  - tutorial
  - infrastructure
---

## Background

The Aztec full node is a critical infrastructure component that allows users to interact with the Aztec network. Full nodes provide a connection to the network and allow users to send and receive transactions and state updates without relying on a third party. Running a full node is a great way to support the Aztec network and get involved with the community. Running your own full node is the most privacy preserving way to interact with the Aztec network.

## Prerequisites

Before following this guide, make sure you:

- Have the `aztec` tool [installed](../../../developers/getting_started.md#install-the-sandbox)
- You are using the latest version for the testnet by running `aztec-up -v latest`
- Are running a Linux or MacOS machine with access to a terminal

Join the [Discord](https://discord.gg/aztec) to connect with the community and get help with your setup.

## Setting Up Your Full Node

This guide will describe how to setup your sequencer using the `aztec start` command. For more advanced setups, refer to the Advanced Configuration section below.

The `aztec start` tool is a one-stop-shop for running your sequencer on any Aztec Network. It assigns default values to several config variables based on a `--network` flag and launches a docker container running the sequencer software.

To use the `aztec start` command, you need to obtain the following:

#### RPCs

- An L1 execution client (for reading transactions and state). It can be specified via the `--l1-rpc-urls` flag when using `aztec start` or via the env var `ETHEREUM_HOSTS`.

- An L1 consensus client (for blobs). It can be specified via the `--l1-consensus-host-urls` flag when using `aztec start` or via the env var `L1_CONSENSUS_HOST_URLS`. You can provide fallback URLs by separating them with commas.

- To reduce load on your consensus endpoint, the Aztec sequencer supports an optional remote server that serves blobs to the client. You can pass your own or use one provided by a trusted party via the `--sequencer.blobSinkUrl` flag when using `aztec start`, or via the env var `BLOB_SINK_URL`.

#### Networking

You MUST forward your ports. Your router must send UDP and TCP traffic on port `40400` (unless you changed the default) to your IP address on your local network. Failure to do so may result in your sequencer not participating on the p2p network.

As a tip, configure your router to give your MAC address the same IP address every time it does a DHCP refresh.

You also need to grab your external IP address and pass it along to the `--p2p.p2pIp` when using `aztec start`.

## Starting Your Full Node

```bash
aztec start --node --archiver \
  --network alpha-testnet \
  --l1-rpc-urls https://example.com \
  --l1-consensus-host-urls https://example.com \
  --p2p.p2pIp 999.99.999.99
```

:::tip

For a full overview of all available commands, check out the [CLI reference sheet](./cli_reference.md).
:::

:::tip

If you are unable to determine your public ip. Running the command `curl ifconfig.me` can retrieve it for you.
:::

## Advanced Configuration

### Using Environment Variables

Every flag in the `aztec start` command corresponds to an environment variable. You can see the variable names by running `aztec start --help`. A reference is provided [here](./cli_reference.md).

For example:

- `--l1-rpc-urls` maps to `ETHEREUM_HOSTS`
- `--l1-consensus-host-urls` maps to `L1_CONSENSUS_HOSTS_URLS`

You can create a `.env` file with these variables:

```bash
ETHEREUM_HOSTS=https://example.com
L1_CONSENSUS_HOST_URLS=https://example.com
# Add other configuration variables as needed
```

Then source this file before running your command:

```bash
source .env
aztec start --network alpha-testnet --archiver --node # other flags...
```

### Using a Docker Compose

If you would like to run in a docker compose, you can use a configuration like the one below:

```yml
name: aztec-node
services:
  node:
    network_mode: host # Optional, run with host networking
    image: aztecprotocol/aztec:latest
    environment:
      ETHEREUM_HOSTS: "" # update with L1 execution client URL
      L1_CONSENSUS_HOST_URLS: "" # update with L1 consensus client URL
      DATA_DIRECTORY: /data
      P2P_IP: $P2P_IP
      LOG_LEVEL: debug
    entrypoint: >
      sh -c 'node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js start --network alpha-testnet start --node --archiver'
    ports:
      - 40400:40400/tcp
      - 40400:40400/udp
      - 8080:8080

    volumes:
      - /home/my-node/node:/data # Local directory
```
