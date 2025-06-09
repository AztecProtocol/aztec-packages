---
sidebar_position: 2
title: How to Run a Sequencer Node
description: A comprehensive guide to setting up and running an Aztec Sequencer node on testnet, including infrastructure requirements, configuration options, and troubleshooting tips.
keywords:
  [
    aztec,
    sequencer,
    node,
    blockchain,
    L2,
    scaling,
    ethereum,
    validator,
    setup,
    tutorial,
  ]
tags:
  - sequencer
  - node
  - tutorial
  - infrastructure
---

## Background

The Aztec sequencer node is critical infrastructure responsible for ordering transactions and producing blocks.

The sequencer node takes part in three key actions:

1. Assemble unprocessed transactions and propose the next block
2. Attest to correct execution of txs in the proposed block (if part of validator committee)
3. Submit the successfully attested block to L1

When transactions are sent to the Aztec network, sequencer nodes bundles them into blocks, checking various constraints such as gas limits, block size, and transaction validity. Before a block can be published, it must be validated by a committee of other sequencer nodes (validators in this context) who re-execute public transactions and verify private function proofs so they can attest to correct execution. These validators attest to the block's validity by signing it, and once enough attestations are collected (two-thirds of the committee plus one), the sequencer can submit the block to L1.

The archiver component complements this process by maintaining historical chain data. It continuously monitors L1 for new blocks, processes them, and maintains a synchronized view of the chain state. This includes managing contract data, transaction logs, and L1-to-L2 messages, making it essential for network synchronization and data availability.

## Setup

### Requirements

A computer running Linux or MacOS with the following specifictions:

- CPU: 8-cores
- RAM: 16 GiB
- Storage: 1 TB SSD

A Network connection of at least 25 Mbps up/down.

### Installation

import { General, Fees } from '@site/src/components/Snippets/general_snippets';

<General.InstallationInstructions />

Now install the latest testnet version of aztec: `aztec-up -v 0.87.8`

Join the [Discord](https://discord.gg/aztec) to connect with the community and get help with your setup.

## Sequencer Quickstart

With the alpha-testnet version of the aztec tools, you now need to define required variables for your node.

The following variable names are specific to the `aztec start` command, set them as variables in the terminal or inline before the command.

- `ETHEREUM_HOSTS=<url>`: One or more comma-separated public rpc provider url(s). NB - don't share your access token
- `L1_CONSENSUS_HOST_URLS=<url>`: One or more comma-separated public rpc provider url(s) that supports consensus client requests
- `VALIDATOR_PRIVATE_KEY="Ox<hex value>"`: Private key of testnet L1 EOA that holds Sepolia ETH (0.01 Sepolia ETH can get you started)
- `COINBASE="0x<eth address>"`: Recipient of block rewards (for node security on mainnet, this should be a different address to the validator eoa)
- `P2P_IP="x.x.x.x"`: IP address of computer running the node (you can get this by running, `curl api.ipify.org`, on your node)

Now in a terminal start your node as a sequencer and archiver:

If the above variables are set you can simply use: `aztec start --node --archiver --sequencer --network alpha-testnet`

Otherwise you can specify values via the CLI flags (using values in place of the variable names):

```bash
aztec start --node --archiver --sequencer \
  --network alpha-testnet \
  --l1-rpc-urls $ETHEREUM_HOSTS \
  --l1-consensus-host-urls $L1_CONSENSUS_HOST_URLS \
  --sequencer.validatorPrivateKey $VALIDATOR_PRIVATE_KEY \
  --sequencer.coinbase $COINBASE \
  --p2p.p2pIp $P2P_IP
```

**Additional Parameters**: The comprehensive list of parameters can be seen via: `aztec help start`. For example:

```
--p2p.p2pPort <value>        (default: 40400)        ($P2P_PORT)
      The port for the P2P service.
```

### Port forwarding

For some restricted environments, you may need to explicity forward the p2p port (default: 40400) to your local node ip address.

This is often in a router's advanced network settings if required.

### Next steps

To add your sequencer you'll need the following few values, as well as `ETHEREUM_HOSTS` from before:

- `STAKING_ASSET_HANDLER="0xF739D03e98e23A7B65940848aBA8921fF3bAc4b2"`: Constant L1 contract address
- `L1_CHAIN_ID="11155111"`: Sepolia chainid
- `PRIVATE_KEY="0x<hex value>`: private key of account with sepolia eth to make transaction (eg can use funded validator key)

Then run the aztec command to add your address as an L1 validator, with rpc url(s) for Etheruem L1 execution requests:

```bash
aztec add-l1-validator --staking-asset-handler=0xF739D03e98e23A7B65940848aBA8921fF3bAc4b2 \
  --l1-rpc-urls $ETHEREUM_HOSTS \
  --l1-chain-id 11155111 \
  --private-key "0x<hex value>" \
  --attester "0x<eth address>" \
  --proposer-eoa "0x<eth address>"
```

**Tip**: Use `aztec help add-l1-validator` for further parameter details.

:::note Validator Quota Filled

In the absence of real-world staking incentives, becoming a validator is throttled with time, so you may see `ValidatorQuotaFilledUntil(uint256 _timestamp)` at the beginning of the text returned.

The timestamp is when the next round of sequencers can be added as validators, so try again right after that.

:::

## Deeper dive

This guide will describe how to setup your sequencer using the `aztec start` command. For more advanced setups, refer to the Advanced Configuration section below.

The `aztec start` tool is a one-stop-shop for running your sequencer on any Aztec Network. It assigns default values to several config variables based on a `--network` flag and launches a docker container running the sequencer software.

To use the `aztec start` command, you need to obtain the following:

#### RPCs

- An L1 execution client (for reading transactions and state). It can be specified via the `--l1-rpc-urls` flag when using `aztec start` or via the env var `ETHEREUM_HOSTS`. Popular execution clients include [Geth](https://geth.ethereum.org/) or [Nethermind](https://nethermind.io/). You can run your own node or use a service like [Alchemy](https://www.alchemy.com/) or [Infura](https://www.infura.io/).

- An L1 consensus client (for blobs). It can be specified via the `--l1-consensus-host-urls` flag when using `aztec start` or via the env var `L1_CONSENSUS_HOST_URLS`. Popular consensus clients include [Lighthouse](https://lighthouse.sigmaprime.io/) or [Prysm](https://prysmaticlabs.com/). Not all RPC providers support consensus endpoints, [Quicknode](https://www.quicknode.com/) and [dRPC](https://drpc.org/) have been known to work for consensus endpoints.

- To reduce load on your consensus endpoint, the Aztec sequencer supports an optional remote server that serves blobs to the client. This is often called a "blob sink" or "blob storage service". You can pass your own or use one provided by a trusted party via the `--sequencer.blobSinkUrl` flag when using `aztec start`, or via the env var `BLOB_SINK_URL`. Some providers like [Alchemy](https://www.alchemy.com/) offer blob storage services as part of their infrastructure offerings.

#### Ethereum Keys

You will need an Ethereum private key and the corresponding public address. The private key is set via the `--sequencer.validatorPrivateKey` flag while the public address should be specified via the `--sequencer.coinbase ` flag.

The private key is needed as your validator will post blocks to Ethereum, and the public address will be the recipient of any block rewards.

Disclaimer: you may want to generate and use a new Ethereum private key.

#### Networking

You MUST forward your ports. Your router must send UDP and TCP traffic on port `40400` (unless you changed the default) to your IP address on your local network. Failure to do so may result in your sequencer not participating on the p2p network.

As a tip, configure your router to give your MAC address the same IP address every time it does a DHCP refresh.

You also need to grab your external IP address and pass it along to the `--p2p.p2pIp` when using `aztec start`.

#### Sepolia ETH

You'll need Sepolia ETH to cover gas costs. Here are some options:

- Use a PoW faucet like [Sepolia PoW Faucet](https://sepolia-faucet.pk910.de/)
- Ask in our Discord community (and remember to pay it forward when you can!)

### Now Start Your Sequencer

To boot up a sequencer using `aztec start`, run the following command:

```bash
aztec start --node --archiver --sequencer \
  --network alpha-testnet \
  --l1-rpc-urls https://example.com \
  --l1-consensus-host-urls https://example.com \
  --sequencer.validatorPrivateKey 0xYourPrivateKey \
  --sequencer.coinbase 0xYourAddress \
  --p2p.p2pIp 999.99.999.99 \
  --p2p.maxTxPoolSize 1000000000
```

:::tip

For a full overview of all available commands, check out the [CLI reference sheet](./cli_reference.md).
:::

:::tip

If you are unable to determine your public ip. Running the command `curl ipv4.icanhazip.com` can retrieve it for you.
:::

### Register as a Validator

Once your node is fully synced, you can register as a validator using the `add-l1-validator` command:

```bash
aztec add-l1-validator \
  --l1-rpc-urls https://eth-sepolia.g.example.com/example/your-key \
  --private-key your-private-key \
  --attester your-validator-address \
  --proposer-eoa your-validator-address \
  --staking-asset-handler 0xF739D03e98e23A7B65940848aBA8921fF3bAc4b2 \
  --l1-chain-id 11155111
```

:::warning

You may see a warning when trying to register as a validator. To maintain network health there is a daily quota for validators to join the validator set. If you are not able to join, it could mean that today's quota of validators has already been added to the set. If you see this, you can try again later. Read [our blog post](https://aztec.network/blog/what-is-aztec-testnet) for more info.

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
aztec start --network alpha-testnet --archiver --node --sequencer # other flags...
```

### Using a Docker Compose

If you would like to run in a docker compose, you can use a configuration like the one below:

```yml
name: aztec-node
services:
  node:
    network_mode: host # Optional, run with host networking
    image: aztecprotocol/aztec:0.87.8
    environment:
      ETHEREUM_HOSTS: ""
      L1_CONSENSUS_HOST_URLS: ""
      DATA_DIRECTORY: /data
      VALIDATOR_PRIVATE_KEY: $VALIDATOR_PRIVATE_KEY
      P2P_IP: $P2P_IP
      LOG_LEVEL: debug
    entrypoint: >
      sh -c 'node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js start --network alpha-testnet start --node --archiver --sequencer'
    ports:
      - 40400:40400/tcp
      - 40400:40400/udp
      - 8080:8080

    volumes:
      - /home/my-node/node:/data # Local directory
```

## Troubleshooting

### L1 Access

If you're hosting your own Ethereum execution or consensus client locally (rather than using an external RPC like Alchemy), you need to ensure that the prover node inside Docker can reach it.

By default, Docker runs containers on a bridge network that isolates them from the host machine's network interfaces. This means localhost inside the container won't point to the host's localhost.

To fix this:

Option 1: Use the special hostname host.docker.internal
This tells Docker to route traffic from the container to the host machine. For example:

```bash
--l1-rpc-urls http://host.docker.internal:8545
```

Option 2: Add a host network entry to your Docker Compose file (advanced users)
This gives your container direct access to the host's network stack, but removes Docker's network isolation. Add to your `docker-compose.yml`

```yaml
network_mode: "host"
```

⚠️ Note: network_mode: "host" only works on Linux. On macOS and Windows, use `host.docker.internal`.

:::info

You can run your own Sepolia ETH Node. However, at the moment only [`geth`](https://github.com/ethereum/go-ethereum) and [`reth`](https://github.com/paradigmxyz/reth) nodes are confirmed to work reliably with the Aztec client.

:::

Once you have your node running, head to the [Aztec Discord](https://discord.gg/aztec) to interact with other network operators.

Happy sequencing!
